import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE } from "../declarations/challenge";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChallengeStatus =
  | { Pending: null } | { Accepted: null } | { Completed: null }
  | { Declined: null } | { Expired: null };

export type ChallengeResult = {
  principal:  import("@icp-sdk/core/principal").Principal;
  score:      bigint;
  finishedAt: bigint;
};

export type Challenge = {
  id:          string;
  challenger:  import("@icp-sdk/core/principal").Principal;
  challenged:  import("@icp-sdk/core/principal").Principal;
  sport:       string;
  articleIds:  string[];
  questionIds: string[];
  count:       bigint;
  status:      ChallengeStatus;
  results:     ChallengeResult[];
  createdAt:   bigint;
  expiresAt:   bigint;
};

// Crew pregame (#64): officials on the same game play one question set and
// see each other's misses.
export type CrewResult = {
  principal:  import("@icp-sdk/core/principal").Principal;
  score:      bigint;
  missed:     string[];
  finishedAt: bigint;
};

export type Crew = {
  id:          string;
  code:        string;
  creator:     import("@icp-sdk/core/principal").Principal;
  gameLabel:   string;
  gameDate:    bigint; // nanoseconds
  sportId:     string;
  levelId:     string;
  questionIds: string[];
  members:     import("@icp-sdk/core/principal").Principal[];
  results:     CrewResult[];
  createdAt:   bigint;
  expiresAt:   bigint;
};

export type CrewPreview = {
  id: string; gameLabel: string; gameDate: bigint; sportId: string; levelId: string;
  memberCount: bigint; questionCount: bigint; expiresAt: bigint;
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = canisterId("challenge");

function actor() {
  return createActor<_SERVICE>(CANISTER_ID, idlFactory);
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

  /** Records the caller's result from the graded exam session they played this challenge in. */
  async submitGradedResult(id: string, sessionId: string): Promise<Challenge> {
    if (!CANISTER_ID) throw new Error("Canister not deployed");
    const res = await actor().submitGradedResult(id, sessionId);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async getChallenge(id: string): Promise<Challenge | null> {
    if (!CANISTER_ID) return MOCK_CHALLENGES.find(c => c.id === id) ?? null;
    const res = await actor().getChallenge(id);
    return res.length ? res[0] : null;
  },

  // ─── Crews ──────────────────────────────────────────────────────────────

  /** gameDateMs is JS milliseconds. */
  async createCrew(input: { gameLabel: string; gameDateMs: number; sportId: string; levelId: string; questionIds: string[] }): Promise<Crew> {
    if (!CANISTER_ID) throw new Error("Canister not deployed");
    const res = await actor().createCrew({
      gameLabel: input.gameLabel, gameDate: BigInt(Math.round(input.gameDateMs)) * 1_000_000n,
      sportId: input.sportId, levelId: input.levelId, questionIds: input.questionIds,
    });
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async getCrewPreview(code: string): Promise<CrewPreview | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getCrewPreview(code);
    return res.length ? res[0] : null;
  },

  async joinCrew(code: string): Promise<Crew> {
    if (!CANISTER_ID) throw new Error("Canister not deployed");
    const res = await actor().joinCrew(code);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  /** Members only; null when the crew doesn't exist or the caller isn't in it. */
  async getCrew(id: string): Promise<Crew | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getCrew(id);
    return res.length ? res[0] : null;
  },

  async getMyCrews(): Promise<Crew[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyCrews();
  },

  async submitCrewResult(id: string, sessionId: string): Promise<Crew> {
    const res = await actor().submitCrewResult(id, sessionId);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async leaveCrew(id: string): Promise<void> {
    const res = await actor().leaveCrew(id);
    if ("err" in res) throw new Error(res.err);
  },
};
