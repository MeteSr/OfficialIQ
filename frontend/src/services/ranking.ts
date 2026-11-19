import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE } from "../declarations/ranking";

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

export type PublicStats = { principal: any; displayName: string; elo: number; accuracy: number; avgElapsedSec: number; streak: bigint };
export type UserStats = {
  principal:     import("@icp-sdk/core/principal").Principal;
  displayName:   string;
  sport:         string;
  state:         string;
  elo:           number;
  streak:        bigint;
  bestStreak:    bigint;
  accuracy:      number;
  avgElapsedSec: number;
  examCount:     bigint;
  updatedAt:     bigint;
};

export type EloSnapshot = { elo: number; accuracy: number; timestamp: bigint };

export type DailyActivity = {
  currentStreak:     bigint;
  longestStreak:     bigint;
  activityDay:       bigint;
  answeredToday:     bigint;
  lastQualifyingDay: bigint;
};

export type SkillCounters = {
  casebookCorrect: bigint;
  casebookTotal:   bigint;
  speedStreak:     bigint;
  bestSpeedStreak: bigint;
};

export type Group = {
  id:          string;
  name:        string;
  sport:       string;
  state:       string;
  isPrivate:   boolean;
  owner:       import("@icp-sdk/core/principal").Principal;
  memberCount: bigint;
  createdAt:   bigint;
};

export type GroupChallenge = {
  id:        string;
  groupId:   string;
  title:     string;
  deadline:  bigint;
  createdAt: bigint;
};

export type GroupLeaderboardEntry = {
  rank:           bigint;
  principal:      import("@icp-sdk/core/principal").Principal;
  displayName:    string;
  weeklyAccuracy: number;
};

export type SortKey = "Elo" | "Accuracy" | "Speed";
type SortKeyVariant = { Elo: null } | { Accuracy: null } | { Speed: null };
const sortKeyToVariant = (key: SortKey): SortKeyVariant => ({ [key]: null } as SortKeyVariant);

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

const CANISTER_ID = canisterId("ranking");

function actor() {
  return createActor<_SERVICE>(CANISTER_ID, idlFactory);
}

/** The ranking canister refused a claim; retrying the same claim won't succeed. */
export class ClaimRefused extends Error {}

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

  async getMyEloHistory(): Promise<EloSnapshot[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyEloHistory();
  },

  /** The leaderboard fields for another official — full stats are private. */
  async getPublicStats(p: any): Promise<PublicStats | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getPublicStats(p);
    return res.length ? res[0] : null;
  },

  async getStats(p: any): Promise<UserStats | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getStats(p);
    return res.length ? res[0] : null;
  },

  async addFriend(p: any): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().addFriend(p);
    if ("err" in res) throw new Error(res.err);
  },

  async removeFriend(p: any): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().removeFriend(p);
    if ("err" in res) throw new Error(res.err);
  },

  async getFriendPrincipals(): Promise<any[]> {
    if (!CANISTER_ID) return [];
    return actor().getFriendPrincipals();
  },

  /**
   * Counts a finished graded exam session (scored by the exam canister) toward the leaderboard.
   * Throws ClaimRefused when the canister answers with an error (already counted, too few
   * questions, ...), which retrying won't fix; any other error is a failed call.
   */
  async claimExamResult(sessionId: string, displayName: string, state: string): Promise<UserStats | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().claimExamResult(sessionId, displayName, state);
    if ("err" in res) throw new ClaimRefused(res.err);
    return res.ok;
  },

  async recordQuestionsAnswered(count: number): Promise<DailyActivity | null> {
    if (!CANISTER_ID || count <= 0) return null;
    return actor().recordQuestionsAnswered(BigInt(count));
  },

  async getDailyStreak(): Promise<DailyActivity | null> {
    if (!CANISTER_ID) return null;
    return actor().getDailyStreak();
  },

  async recordAnswerSignal(isCorrect: boolean, elapsedSec: number, isCasebook: boolean): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().recordAnswerSignal(isCorrect, BigInt(Math.max(0, Math.round(elapsedSec))), isCasebook);
  },

  async getSkillCounters(): Promise<SkillCounters | null> {
    if (!CANISTER_ID) return null;
    return actor().getSkillCounters();
  },

  async createGroup(name: string, sport: string, state: string, isPrivate: boolean): Promise<Group> {
    const res = await actor().createGroup(name, sport, state, isPrivate);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async joinGroup(groupId: string): Promise<Group> {
    const res = await actor().joinGroup(groupId);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async leaveGroup(groupId: string): Promise<void> {
    const res = await actor().leaveGroup(groupId);
    if ("err" in res) throw new Error(res.err);
  },

  async postGroupChallenge(groupId: string, title: string, deadline: number): Promise<GroupChallenge> {
    const res = await actor().postGroupChallenge(groupId, title, BigInt(deadline) * 1_000_000n);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async listPublicGroups(sport: string): Promise<Group[]> {
    if (!CANISTER_ID) return [];
    return actor().listPublicGroups(sport);
  },

  async getMyGroups(): Promise<Group[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyGroups();
  },

  async getGroup(groupId: string): Promise<Group | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getGroup(groupId);
    return res.length ? res[0] : null;
  },

  async getGroupChallenges(groupId: string): Promise<GroupChallenge[]> {
    if (!CANISTER_ID) return [];
    return actor().getGroupChallenges(groupId);
  },

  async getGroupLeaderboard(groupId: string): Promise<GroupLeaderboardEntry[]> {
    if (!CANISTER_ID) return [];
    return actor().getGroupLeaderboard(groupId);
  },
};
