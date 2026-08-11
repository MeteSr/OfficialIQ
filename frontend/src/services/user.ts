import { IDL } from "@icp-sdk/core/candid";
import { createActor } from "./actor";

// ─── Candid IDL ──────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Role        = I.Variant({ Official: I.Null, Assessor: I.Null, Admin: I.Null });
  const Profile     = I.Record({ principal: I.Principal, displayName: I.Text, role: Role, sport: I.Text, level: I.Text, state: I.Text, createdAt: I.Int });
  const ProfileUpd  = I.Record({ displayName: I.Text, sport: I.Text, level: I.Text, state: I.Text });
  const ResultP     = I.Variant({ ok: Profile, err: I.Text });
  const StudyPace   = I.Record({ articlesPerWeek: I.Nat, startDate: I.Int });
  const ResultPace  = I.Variant({ ok: StudyPace, err: I.Text });
  const ArticleProgress = I.Record({ articleId: I.Text, lastStudied: I.Int, timesStudied: I.Nat, masteryScore: I.Nat });
  const WeeklySchedule  = I.Record({ dueThisWeek: I.Vec(I.Text), overdue: I.Vec(I.Text), weekNumber: I.Nat });
  const WeeklyQuizResult = I.Record({ weekNumber: I.Nat, newScore: I.Nat, retentionScore: I.Nat, completedAt: I.Int });
  return I.Service({
    createProfile:        I.Func([ProfileUpd],       [ResultP],        []),
    updateProfile:        I.Func([ProfileUpd],       [ResultP],        []),
    getMyProfile:         I.Func([],                 [I.Opt(Profile)], ["query"]),
    getProfile:           I.Func([I.Principal],      [I.Opt(Profile)], ["query"]),
    setStudyPace:         I.Func([I.Nat],             [ResultPace],     []),
    recordArticleStudied: I.Func([I.Text, I.Nat],    [],               []),
    recordWeeklyQuizResult: I.Func([I.Nat, I.Nat, I.Nat], [],          []),
    getMyStudyPace:       I.Func([],                 [I.Opt(StudyPace)], ["query"]),
    getMyProgress:        I.Func([],                 [I.Vec(ArticleProgress)], ["query"]),
    getWeeklySchedule:    I.Func([I.Vec(I.Text)],     [WeeklySchedule], ["query"]),
    getWeeklyQuizHistory: I.Func([],                 [I.Vec(WeeklyQuizResult)], ["query"]),
    metrics:              I.Func([],                 [I.Record({ userCount: I.Nat })], ["query"]),
  });
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = { Official: null } | { Assessor: null } | { Admin: null };
export type UserProfile = {
  principal:   import("@icp-sdk/core/principal").Principal;
  displayName: string;
  role:        UserRole;
  sport:       string;
  level:       string;
  state:       string;
  createdAt:   bigint;
};
export type ProfileUpdate = { displayName: string; sport: string; level: string; state: string };

export type StudyPace = { articlesPerWeek: bigint; startDate: bigint };
export type ArticleProgress = { articleId: string; lastStudied: bigint; timesStudied: bigint; masteryScore: bigint };
export type WeeklySchedule = { dueThisWeek: string[]; overdue: string[]; weekNumber: bigint };
export type WeeklyQuizResult = { weekNumber: bigint; newScore: bigint; retentionScore: bigint; completedAt: bigint };

// ─── Mock ─────────────────────────────────────────────────────────────────────

const MOCK_PROFILE: UserProfile = {
  principal:   { toString: () => "2vxsx-fae" } as any,
  displayName: "Demo Official",
  role:        { Official: null },
  sport:       "ncaa_basketball",
  level:       "varsity",
  state:       "TX",
  createdAt:   BigInt(Date.now()) * BigInt(1_000_000),
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_USER !== "undefined" ? CANISTER_ID_USER : "";

function actor() {
  return createActor<{
    createProfile:        (u: ProfileUpdate) => Promise<{ ok: UserProfile } | { err: string }>;
    updateProfile:        (u: ProfileUpdate) => Promise<{ ok: UserProfile } | { err: string }>;
    getMyProfile:         ()                 => Promise<[] | [UserProfile]>;
    getProfile:           (p: any)           => Promise<[] | [UserProfile]>;
    setStudyPace:         (n: bigint)        => Promise<{ ok: StudyPace } | { err: string }>;
    recordArticleStudied: (articleId: string, score: bigint) => Promise<undefined>;
    recordWeeklyQuizResult: (weekNumber: bigint, newScore: bigint, retentionScore: bigint) => Promise<undefined>;
    getMyStudyPace:       ()                 => Promise<[] | [StudyPace]>;
    getMyProgress:        ()                 => Promise<ArticleProgress[]>;
    getWeeklySchedule:    (ids: string[])    => Promise<WeeklySchedule>;
    getWeeklyQuizHistory: ()                 => Promise<WeeklyQuizResult[]>;
  }>(CANISTER_ID, idlFactory);
}

export const userService = {
  async getMyProfile(): Promise<UserProfile | null> {
    if (!CANISTER_ID) return MOCK_PROFILE;
    const res = await actor().getMyProfile();
    return res.length ? res[0] : null;
  },

  async getProfile(p: any): Promise<UserProfile | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getProfile(p);
    return res.length ? res[0] : null;
  },

  async createProfile(update: ProfileUpdate): Promise<UserProfile> {
    if (!CANISTER_ID) return { ...MOCK_PROFILE, ...update };
    const res = await actor().createProfile(update);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async updateProfile(update: ProfileUpdate): Promise<UserProfile> {
    if (!CANISTER_ID) return { ...MOCK_PROFILE, ...update };
    const res = await actor().updateProfile(update);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async setStudyPace(articlesPerWeek: number): Promise<StudyPace> {
    if (!CANISTER_ID) return { articlesPerWeek: BigInt(articlesPerWeek), startDate: BigInt(Date.now()) * 1_000_000n };
    const res = await actor().setStudyPace(BigInt(articlesPerWeek));
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async recordArticleStudied(articleId: string, score: number): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().recordArticleStudied(articleId, BigInt(Math.round(score)));
  },

  async getMyStudyPace(): Promise<StudyPace | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getMyStudyPace();
    return res.length ? res[0] : null;
  },

  async getMyProgress(): Promise<ArticleProgress[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyProgress();
  },

  async getWeeklySchedule(allArticleIds: string[]): Promise<WeeklySchedule> {
    if (!CANISTER_ID) return { dueThisWeek: allArticleIds.slice(0, 2), overdue: [], weekNumber: 1n };
    return actor().getWeeklySchedule(allArticleIds);
  },

  async recordWeeklyQuizResult(weekNumber: number, newScore: number, retentionScore: number): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().recordWeeklyQuizResult(BigInt(weekNumber), BigInt(Math.round(newScore)), BigInt(Math.round(retentionScore)));
  },

  async getWeeklyQuizHistory(): Promise<WeeklyQuizResult[]> {
    if (!CANISTER_ID) return [];
    return actor().getWeeklyQuizHistory();
  },
};
