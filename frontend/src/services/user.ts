import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE } from "../declarations/user";

// ─── Candid IDL ──────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

export type PublicProfile = { principal: any; displayName: string; sport: string; level: string; state: string };
export type UserRole = { Official: null } | { Assessor: null } | { Admin: null } | { Coordinator: null };
export type UserProfile = {
  principal:         import("@icp-sdk/core/principal").Principal;
  displayName:       string;
  role:              UserRole;
  sport:             string;
  level:             string;
  state:             string;
  preferredLanguage: string;
  createdAt:         bigint;
};
export type ProfileUpdate = { displayName: string; sport: string; level: string; state: string; preferredLanguage: string };

export type StudyPace = { articlesPerWeek: bigint; startDate: bigint };
export type ArticleProgress = { articleId: string; lastStudied: bigint; timesStudied: bigint; masteryScore: bigint };
export type WeeklySchedule = { dueThisWeek: string[]; overdue: string[]; weekNumber: bigint };
export type WeeklyQuizResult = { weekNumber: bigint; newScore: bigint; retentionScore: bigint; completedAt: bigint };
export type MonthlyQuizResult = { month: bigint; score: bigint; articleScores: [string, bigint][]; completedAt: bigint };

export type LinkedAccount = { provider: string; externalId: string; linkedAt: bigint };
export type UpcomingGame = { id: string; opponent: string; gameDate: bigint; sportId: string; levelId: string; notes: string; createdAt: bigint };
export type UpcomingGameInput = { opponent: string; gameDate: number; sportId: string; levelId: string; notes: string };

export type PushSubscriptionInput =
  | { WebPush: { endpoint: string; p256dh: string; auth: string } }
  | { Native: { token: string; platform: string } };

export type ClientErrorInput = { kind: string; message: string; stack: string; route: string; release: string; platform: string };
export type ClientError = ClientErrorInput & { seq: bigint; at: bigint; signedIn: boolean };

// ─── Mock ─────────────────────────────────────────────────────────────────────

const MOCK_PROFILE: UserProfile = {
  principal:         { toString: () => "2vxsx-fae" } as any,
  displayName:       "Demo Official",
  role:              { Official: null },
  sport:             "ncaa_basketball",
  level:             "varsity",
  state:             "TX",
  preferredLanguage: "en",
  createdAt:         BigInt(Date.now()) * BigInt(1_000_000),
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = canisterId("user");

function actor() {
  return createActor<_SERVICE>(CANISTER_ID, idlFactory);
}

export const userService = {
  async getMyProfile(): Promise<UserProfile | null> {
    if (!CANISTER_ID) return MOCK_PROFILE;
    const res = await actor().getMyProfile();
    return res.length ? res[0] : null;
  },

  /** Name and sport of another official — full profiles are private to their owner. */
  async getPublicProfile(p: any): Promise<PublicProfile | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getPublicProfile(p);
    return res.length ? res[0] : null;
  },

  /** Full profile: only returns data for the caller themself (or an admin). */
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

  async recordMonthlyQuizResult(month: number, score: number, articleScores: [string, number][]): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().recordMonthlyQuizResult(
      BigInt(month), BigInt(Math.round(score)),
      articleScores.map(([id, s]) => [id, BigInt(Math.round(s))] as [string, bigint]),
    );
  },

  async getMonthlyQuizHistory(): Promise<MonthlyQuizResult[]> {
    if (!CANISTER_ID) return [];
    return actor().getMonthlyQuizHistory();
  },

  async becomeCoordinator(): Promise<UserProfile> {
    if (!CANISTER_ID) return { ...MOCK_PROFILE, role: { Coordinator: null } };
    const res = await actor().becomeCoordinator();
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async linkExternalAccount(provider: string, externalId: string): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().linkExternalAccount(provider, externalId);
    if ("err" in res) throw new Error(res.err);
  },

  async unlinkExternalAccount(provider: string): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().unlinkExternalAccount(provider);
    if ("err" in res) throw new Error(res.err);
  },

  async getMyLinkedAccounts(): Promise<LinkedAccount[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyLinkedAccounts();
  },

  // input.gameDate is a JS milliseconds timestamp (Date.getTime()); the
  // canister stores/compares Int time fields in nanoseconds throughout this
  // app (matching Time.now()), so it's converted here at the service
  // boundary rather than pushing unit-juggling onto every caller.
  async addUpcomingGame(input: UpcomingGameInput): Promise<UpcomingGame> {
    if (!CANISTER_ID) throw new Error("User canister not deployed");
    const res = await actor().addUpcomingGame({ ...input, gameDate: BigInt(input.gameDate) * 1_000_000n });
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async removeUpcomingGame(id: string): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().removeUpcomingGame(id);
    if ("err" in res) throw new Error(res.err);
  },

  async getMyUpcomingGames(): Promise<UpcomingGame[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyUpcomingGames();
  },

  async registerPushSubscription(sub: PushSubscriptionInput): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().registerPushSubscription(sub);
    if ("err" in res) throw new Error(res.err);
  },

  async unregisterPushSubscription(): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().unregisterPushSubscription();
    if ("err" in res) throw new Error(res.err);
  },

  async getMyPushSubscription(): Promise<PushSubscriptionInput | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getMyPushSubscription();
    return res.length ? res[0] : null;
  },

  /**
   * Deletes the caller's account. The profile is gone when this returns;
   * the other canisters forget them shortly after (getDeletionStatus).
   */
  async deleteAccount(): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().deleteAccount();
    if ("err" in res) throw new Error(res.err);
  },

  /** How many canisters still hold the caller's data, or null when no deletion is running. */
  async getDeletionStatus(): Promise<number | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getDeletionStatus();
    return "InProgress" in res ? Number(res.InProgress.remaining) : null;
  },

  async logClientError(report: ClientErrorInput): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().logClientError(report);
  },

  /** Admin only: the newest app errors. */
  async listClientErrors(limit = 100): Promise<ClientError[]> {
    if (!CANISTER_ID) return [];
    const res = await actor().listClientErrors(BigInt(limit));
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async isAdmin(): Promise<boolean> {
    if (!CANISTER_ID) return false;
    return actor().isAdminCaller();
  },
};
