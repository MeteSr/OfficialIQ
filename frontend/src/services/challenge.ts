import { IDL } from "@dfinity/candid";
import { createActor } from "./actor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChallengeStatus =
  | { Pending: null } | { Accepted: null } | { Completed: null }
  | { Declined: null } | { Expired: null };

export type ChallengeResult = {
  principal:  import("@dfinity/principal").Principal;
  score:      bigint;
  finishedAt: bigint;
};

export type Challenge = {
  id:          string;
  challenger:  import("@dfinity/principal").Principal;
  challenged:  import("@dfinity/principal").Principal;
  sport:       string;
  articleIds:  string[];
  questionIds: string[];
  count:       bigint;
  status:      ChallengeStatus;
  results:     ChallengeResult[];
  createdAt:   bigint;
  expiresAt:   bigint;
};

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const Status  = I.Variant({ Pending: I.Null, Accepted: I.Null, Completed: I.Null, Declined: I.Null, Expired: I.Null });
  const CRes    = I.Record({ principal: I.Principal, score: I.Nat, finishedAt: I.Int });
  const Ch      = I.Record({
    id: I.Text, challenger: I.Principal, challenged: I.Principal, sport: I.Text,
    articleIds: I.Vec(I.Text), questionIds: I.Vec(I.Text), count: I.Nat,
    status: Status, results: I.Vec(CRes), createdAt: I.Int, expiresAt: I.Int,
  });
  const ResultC = I.Variant({ ok: Ch, err: I.Text });
  return I.Service({
    sendChallenge:   I.Func([I.Principal, I.Text, I.Vec(I.Text), I.Vec(I.Text), I.Nat], [ResultC], []),
    acceptChallenge: I.Func([I.Text], [ResultC], []),
    submitResult:    I.Func([I.Text, I.Nat], [ResultC], []),
    getMyChallenges: I.Func([], [I.Vec(Ch)], ["query"]),
    getChallenge:    I.Func([I.Text], [I.Opt(Ch)], ["query"]),
    metrics:         I.Func([], [I.Record({ challengeCount: I.Nat })], ["query"]),
  });
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_CHALLENGE !== "undefined" ? CANISTER_ID_CHALLENGE : "";

function actor() {
  return createActor<{
    sendChallenge:   (opponent: any, sport: string, articleIds: string[], questionIds: string[], count: bigint) => Promise<{ ok: Challenge } | { err: string }>;
    acceptChallenge: (id: string) => Promise<{ ok: Challenge } | { err: string }>;
    submitResult:    (id: string, score: bigint) => Promise<{ ok: Challenge } | { err: string }>;
    getMyChallenges: () => Promise<Challenge[]>;
    getChallenge:    (id: string) => Promise<[] | [Challenge]>;
  }>(CANISTER_ID, idlFactory);
}

// Mock: one pending challenge from "Marcus R."
const MOCK_CHALLENGES: Challenge[] = [
  {
    id: "ch001",
    challenger:  { toString: () => "abc-1" } as any,
    challenged:  { toString: () => "local" } as any,
    sport: "ncaa_basketball",
    articleIds: ["ncaa_basketball:art4"],
    questionIds: [],
    count: 10n,
    status: { Pending: null },
    results: [],
    createdAt: BigInt(Date.now() - 3600_000) * 1_000_000n,
    expiresAt: BigInt(Date.now() + 68400_000) * 1_000_000n,
  },
];

export const challengeService = {
  async getMyChallenges(): Promise<Challenge[]> {
    if (!CANISTER_ID) return MOCK_CHALLENGES;
    return actor().getMyChallenges();
  },

  async sendChallenge(
    opponent: any,
    sport: string,
    articleIds: string[],
    questionIds: string[],
    count: number,
  ): Promise<Challenge> {
    if (!CANISTER_ID) throw new Error("Canister not deployed");
    const res = await actor().sendChallenge(opponent, sport, articleIds, questionIds, BigInt(count));
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async acceptChallenge(id: string): Promise<Challenge> {
    if (!CANISTER_ID) {
      const ch = MOCK_CHALLENGES.find(c => c.id === id);
      if (!ch) throw new Error("Not found");
      return { ...ch, status: { Accepted: null } };
    }
    const res = await actor().acceptChallenge(id);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async submitResult(id: string, score: number): Promise<Challenge> {
    if (!CANISTER_ID) throw new Error("Canister not deployed");
    const res = await actor().submitResult(id, BigInt(score));
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },
};
