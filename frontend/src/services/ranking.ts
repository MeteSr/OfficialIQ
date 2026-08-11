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

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Entry = I.Record({ rank: I.Nat, principal: I.Principal, displayName: I.Text, elo: I.Float64, accuracy: I.Float64, avgElapsedSec: I.Float64, streak: I.Nat });
  const Stats = I.Record({ principal: I.Principal, displayName: I.Text, sport: I.Text, state: I.Text, elo: I.Float64, streak: I.Nat, bestStreak: I.Nat, accuracy: I.Float64, avgElapsedSec: I.Float64, examCount: I.Nat, updatedAt: I.Int });
  const EloSnapshotRec = I.Record({ elo: I.Float64, accuracy: I.Float64, timestamp: I.Int });
  const Activity = I.Record({ currentStreak: I.Nat, longestStreak: I.Nat, activityDay: I.Int, answeredToday: I.Nat, lastQualifyingDay: I.Int });
  const Skills = I.Record({ casebookCorrect: I.Nat, casebookTotal: I.Nat, speedStreak: I.Nat, bestSpeedStreak: I.Nat });
  const GroupRec = I.Record({ id: I.Text, name: I.Text, sport: I.Text, state: I.Text, isPrivate: I.Bool, owner: I.Principal, memberCount: I.Nat, createdAt: I.Int });
  const GroupChallengeRec = I.Record({ id: I.Text, groupId: I.Text, title: I.Text, deadline: I.Int, createdAt: I.Int });
  const GroupEntry = I.Record({ rank: I.Nat, principal: I.Principal, displayName: I.Text, weeklyAccuracy: I.Float64 });
  const SortKeyVariant = I.Variant({ Elo: I.Null, Accuracy: I.Null, Speed: I.Null });
  const ResultU = I.Variant({ ok: I.Null, err: I.Text });
  const ResultGroup = I.Variant({ ok: GroupRec, err: I.Text });
  const ResultGroupChallenge = I.Variant({ ok: GroupChallengeRec, err: I.Text });
  return I.Service({
    recordExamResult:      I.Func([I.Nat, I.Nat, I.Text, I.Text, I.Text, I.Nat], [I.Null], []),
    addFriend:             I.Func([I.Principal], [ResultU], []),
    removeFriend:          I.Func([I.Principal], [ResultU], []),
    getFriendPrincipals:   I.Func([], [I.Vec(I.Principal)], ["query"]),
    getStats:              I.Func([I.Principal], [I.Opt(Stats)], ["query"]),
    getNational:           I.Func([I.Text, I.Nat, SortKeyVariant], [I.Vec(Entry)], ["query"]),
    getState:              I.Func([I.Text, I.Text, I.Nat, SortKeyVariant], [I.Vec(Entry)], ["query"]),
    getFriends:            I.Func([I.Text, I.Nat, SortKeyVariant], [I.Vec(Entry)], ["query"]),
    getMyStats:            I.Func([], [I.Opt(Stats)], ["query"]),
    getMyEloHistory:       I.Func([], [I.Vec(EloSnapshotRec)], ["query"]),
    recordQuestionsAnswered: I.Func([I.Nat], [Activity], []),
    getDailyStreak:        I.Func([], [Activity], ["query"]),
    recordAnswerSignal:    I.Func([I.Bool, I.Nat, I.Bool], [], []),
    getSkillCounters:      I.Func([], [Skills], ["query"]),
    createGroup:           I.Func([I.Text, I.Text, I.Text, I.Bool], [ResultGroup], []),
    joinGroup:              I.Func([I.Text], [ResultGroup], []),
    leaveGroup:            I.Func([I.Text], [ResultU], []),
    postGroupChallenge:    I.Func([I.Text, I.Text, I.Int], [ResultGroupChallenge], []),
    listPublicGroups:      I.Func([I.Text], [I.Vec(GroupRec)], ["query"]),
    getMyGroups:           I.Func([], [I.Vec(GroupRec)], ["query"]),
    getGroup:              I.Func([I.Text], [I.Opt(GroupRec)], ["query"]),
    getGroupChallenges:    I.Func([I.Text], [I.Vec(GroupChallengeRec)], ["query"]),
    getGroupLeaderboard:   I.Func([I.Text], [I.Vec(GroupEntry)], ["query"]),
    metrics:               I.Func([], [I.Record({ userCount: I.Nat })], ["query"]),
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
    recordExamResult:    (score: bigint, qCount: bigint, name: string, sport: string, state: string, avgElapsedSec: bigint) => Promise<null>;
    addFriend:           (p: any) => Promise<{ ok: null } | { err: string }>;
    removeFriend:        (p: any) => Promise<{ ok: null } | { err: string }>;
    getFriendPrincipals: () => Promise<any[]>;
    getStats:            (p: any) => Promise<[] | [UserStats]>;
    getNational:         (sport: string, limit: bigint, sortBy: SortKeyVariant) => Promise<LeaderboardEntry[]>;
    getState:            (sport: string, state: string, limit: bigint, sortBy: SortKeyVariant) => Promise<LeaderboardEntry[]>;
    getFriends:          (sport: string, limit: bigint, sortBy: SortKeyVariant) => Promise<LeaderboardEntry[]>;
    getMyStats:          () => Promise<[] | [UserStats]>;
    getMyEloHistory:     () => Promise<EloSnapshot[]>;
    recordQuestionsAnswered: (count: bigint) => Promise<DailyActivity>;
    getDailyStreak:      () => Promise<DailyActivity>;
    recordAnswerSignal:  (isCorrect: boolean, elapsedSec: bigint, isCasebook: boolean) => Promise<void>;
    getSkillCounters:    () => Promise<SkillCounters>;
    createGroup:         (name: string, sport: string, state: string, isPrivate: boolean) => Promise<{ ok: Group } | { err: string }>;
    joinGroup:           (groupId: string) => Promise<{ ok: Group } | { err: string }>;
    leaveGroup:          (groupId: string) => Promise<{ ok: null } | { err: string }>;
    postGroupChallenge:  (groupId: string, title: string, deadline: bigint) => Promise<{ ok: GroupChallenge } | { err: string }>;
    listPublicGroups:    (sport: string) => Promise<Group[]>;
    getMyGroups:         () => Promise<Group[]>;
    getGroup:            (groupId: string) => Promise<[] | [Group]>;
    getGroupChallenges:  (groupId: string) => Promise<GroupChallenge[]>;
    getGroupLeaderboard: (groupId: string) => Promise<GroupLeaderboardEntry[]>;
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

  async getMyEloHistory(): Promise<EloSnapshot[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyEloHistory();
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

  async recordExamResult(score: number, questionCount: number, displayName: string, sport: string, state: string, avgElapsedSec: number): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().recordExamResult(BigInt(score), BigInt(questionCount), displayName, sport, state, BigInt(Math.round(avgElapsedSec)));
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
