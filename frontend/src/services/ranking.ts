import { IDL } from "@icp-sdk/core/candid";
import { createActor } from "./actor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeaderboardEntry = {
  rank:          bigint;
  principal:     import("@icp-sdk/core/principal").Principal;
  displayName:   string;
  elo:           number;
  accuracy:      number;
  avgElapsedSec: number;
  streak:        bigint;
};

export type UserStats = {
  principal:     import("@icp-sdk/core/principal").Principal;
  displayName:   string;
  sport:         string;
  state:         string;
  elo:           number;
  streak:        bigint;
  accuracy:      number;
  avgElapsedSec: number;
  examCount:     bigint;
  updatedAt:     bigint;
};

export type SortKey = "Elo" | "Accuracy" | "Speed";
type SortKeyVariant = { Elo: null } | { Accuracy: null } | { Speed: null };
const sortKeyToVariant = (key: SortKey): SortKeyVariant => ({ [key]: null } as SortKeyVariant);

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Entry = I.Record({ rank: I.Nat, principal: I.Principal, displayName: I.Text, elo: I.Float64, accuracy: I.Float64, avgElapsedSec: I.Float64, streak: I.Nat });
  const Stats = I.Record({ principal: I.Principal, displayName: I.Text, sport: I.Text, state: I.Text, elo: I.Float64, streak: I.Nat, accuracy: I.Float64, avgElapsedSec: I.Float64, examCount: I.Nat, updatedAt: I.Int });
  const SortKeyVariant = I.Variant({ Elo: I.Null, Accuracy: I.Null, Speed: I.Null });
  const ResultU = I.Variant({ ok: I.Null, err: I.Text });
  return I.Service({
    recordExamResult: I.Func([I.Nat, I.Nat, I.Text, I.Text, I.Text, I.Nat], [I.Null], []),
    addFriend:        I.Func([I.Principal], [ResultU], []),
    getNational:      I.Func([I.Text, I.Nat, SortKeyVariant], [I.Vec(Entry)], ["query"]),
    getState:         I.Func([I.Text, I.Text, I.Nat, SortKeyVariant], [I.Vec(Entry)], ["query"]),
    getFriends:       I.Func([I.Text, I.Nat, SortKeyVariant], [I.Vec(Entry)], ["query"]),
    getMyStats:       I.Func([], [I.Opt(Stats)], ["query"]),
    metrics:          I.Func([], [I.Record({ userCount: I.Nat })], ["query"]),
  });
};

// ─── Mock ─────────────────────────────────────────────────────────────────────

const makePrincipal = (s: string) => ({ toString: () => s } as any);

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1n, principal: makePrincipal("abc-1"), displayName: "Marcus R.",    elo: 1820, accuracy: 0.962, avgElapsedSec: 14, streak: 28n },
  { rank: 2n, principal: makePrincipal("abc-2"), displayName: "T. Washington", elo: 1754, accuracy: 0.917, avgElapsedSec: 22, streak: 0n  },
  { rank: 3n, principal: makePrincipal("local"), displayName: "You",           elo: 1680, accuracy: 0.842, avgElapsedSec: 31, streak: 14n },
  { rank: 4n, principal: makePrincipal("abc-4"), displayName: "D. Okonkwo",   elo: 1710, accuracy: 0.891, avgElapsedSec: 19, streak: 0n  },
  { rank: 5n, principal: makePrincipal("abc-5"), displayName: "P. Sandoval",  elo: 1698, accuracy: 0.872, avgElapsedSec: 27, streak: 0n  },
];

function sortMock(sortBy: SortKey): LeaderboardEntry[] {
  const key = sortBy === "Elo" ? "elo" : sortBy === "Accuracy" ? "accuracy" : "avgElapsedSec";
  const dir = sortBy === "Speed" ? 1 : -1; // speed: lower is better; elo/accuracy: higher is better
  return [...MOCK_LEADERBOARD]
    .sort((a, b) => dir * (a[key] - b[key]))
    .map((e, i) => ({ ...e, rank: BigInt(i + 1) }));
}

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_RANKING !== "undefined" ? CANISTER_ID_RANKING : "";

function actor() {
  return createActor<{
    recordExamResult: (score: bigint, qCount: bigint, name: string, sport: string, state: string, avgElapsedSec: bigint) => Promise<null>;
    addFriend:        (p: any) => Promise<{ ok: null } | { err: string }>;
    getNational:      (sport: string, limit: bigint, sortBy: SortKeyVariant) => Promise<LeaderboardEntry[]>;
    getState:         (sport: string, state: string, limit: bigint, sortBy: SortKeyVariant) => Promise<LeaderboardEntry[]>;
    getFriends:       (sport: string, limit: bigint, sortBy: SortKeyVariant) => Promise<LeaderboardEntry[]>;
    getMyStats:       () => Promise<[] | [UserStats]>;
  }>(CANISTER_ID, idlFactory);
}

export const rankingService = {
  async getNational(sport: string, limit: number, sortBy: SortKey = "Elo"): Promise<LeaderboardEntry[]> {
    if (!CANISTER_ID) return sortMock(sortBy);
    return actor().getNational(sport, BigInt(limit), sortKeyToVariant(sortBy));
  },

  async getState(sport: string, state: string, limit: number, sortBy: SortKey = "Elo"): Promise<LeaderboardEntry[]> {
    if (!CANISTER_ID) return sortMock(sortBy);
    return actor().getState(sport, state, BigInt(limit), sortKeyToVariant(sortBy));
  },

  async getFriends(sport: string, limit: number, sortBy: SortKey = "Elo"): Promise<LeaderboardEntry[]> {
    if (!CANISTER_ID) return sortMock(sortBy);
    return actor().getFriends(sport, BigInt(limit), sortKeyToVariant(sortBy));
  },

  async getMyStats(): Promise<UserStats | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getMyStats();
    return res.length ? res[0] : null;
  },

  async recordExamResult(score: number, questionCount: number, displayName: string, sport: string, state: string, avgElapsedSec: number): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().recordExamResult(BigInt(score), BigInt(questionCount), displayName, sport, state, BigInt(Math.round(avgElapsedSec)));
  },
};
