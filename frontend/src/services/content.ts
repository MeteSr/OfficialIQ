import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE } from "../declarations/content";
import { cacheArticles, cachePlays, getCachedArticles, getCachedPlays, getCachedAudioBlob } from "../lib/offlineDb";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Article = {
  id:        string;
  sportId:   string;
  levelId:   string;
  number:    bigint;
  title:     string;
  body:      string;
  language:  string;
  audioUrl:  [] | [string];
  createdAt: bigint;
  updatedAt: bigint;
};

export type DiagramPlayer = {
  id:         string;
  x:          bigint;
  y:          bigint;
  shortLabel: string;
  role:       string;
};

export type DiagramArrow = {
  fromId: string;
  toId:   string;
  style:  string;
};

export type CourtDiagram = {
  players: DiagramPlayer[];
  arrows:  DiagramArrow[];
};

export type CasebookPlay = {
  id:        string;
  articleId: string;
  citation:  string;
  scenario:  string;
  ruling:    string;
  audioUrl:  [] | [string];
  diagram:   [] | [CourtDiagram];
  videoUrl:  [] | [string];
};

export type PointOfEmphasis = {
  id:               string;
  season:           string;
  title:            string;
  body:             string;
  linkedArticleIds: string[];
  audioUrl:         [] | [string];
  createdAt:        bigint;
};

export type MechanicsZone = {
  id:              string;
  x:               bigint;
  y:               bigint;
  width:           bigint;
  height:          bigint;
  correctOfficial: string;
};

export type MechanicsScenario = {
  id:          string;
  crewSize:    bigint;
  title:       string;
  description: string;
  players:     DiagramPlayer[];
  zones:       MechanicsZone[];
  createdAt:   bigint;
};

export type SportLevel = { id: string; displayName: string };

export type Sport = {
  id:           string;
  displayName:  string;
  levels:       SportLevel[];
  rulebookYear: string;
};

export type SubmissionStatus = { Pending: null } | { Approved: null } | { Rejected: null };

export type VideoSubmission = {
  id:           string;
  submitter:    import("@icp-sdk/core/principal").Principal;
  citation:     string;
  clipUrl:      string;
  status:       SubmissionStatus;
  linkedPlayId: [] | [string];
  createdAt:    bigint;
  reviewedAt:   [] | [bigint];
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_ARTICLES: Article[] = [
  { id: "ncaa_basketball:art1", sportId: "ncaa_basketball", levelId: "varsity", number: 1n, title: "Court and Equipment",  body: "Rule text for Article 1...", language: "en", audioUrl: [], createdAt: 0n, updatedAt: 0n },
  { id: "ncaa_basketball:art2", sportId: "ncaa_basketball", levelId: "varsity", number: 2n, title: "Players and Rosters",  body: "Rule text for Article 2...", language: "en", audioUrl: [], createdAt: 0n, updatedAt: 0n },
  { id: "ncaa_basketball:art3", sportId: "ncaa_basketball", levelId: "varsity", number: 3n, title: "Officials",            body: "Rule text for Article 3...", language: "en", audioUrl: [], createdAt: 0n, updatedAt: 0n },
  { id: "ncaa_basketball:art4", sportId: "ncaa_basketball", levelId: "varsity", number: 4n, title: "Fouls",                body: "Rule text for Article 4...", language: "en", audioUrl: [], createdAt: 0n, updatedAt: 0n },
  { id: "ncaa_basketball:art5", sportId: "ncaa_basketball", levelId: "varsity", number: 5n, title: "Violations",           body: "Rule text for Article 5...", language: "en", audioUrl: [], createdAt: 0n, updatedAt: 0n },
];

const MOCK_SPORTS: Sport[] = [
  {
    id: "ncaa_basketball", displayName: "NCAA Men's Basketball", rulebookYear: "2025-26",
    levels: [{ id: "varsity", displayName: "Varsity" }, { id: "collegiate", displayName: "Collegiate" }],
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = canisterId("content");

function actor() {
  return createActor<_SERVICE>(CANISTER_ID, idlFactory);
}

export const contentService = {
  async listSports(): Promise<Sport[]> {
    if (!CANISTER_ID) return MOCK_SPORTS;
    try {
      const sports = await actor().listSports();
      return sports.length ? sports : MOCK_SPORTS;
    } catch {
      return MOCK_SPORTS;
    }
  },

  // language defaults to "en" so every existing call site (there are many)
  // keeps working unchanged — only pages that actually need translated
  // content pass it explicitly.
  async listArticles(sportId: string, levelId: string, language: string = "en"): Promise<Article[]> {
    if (!CANISTER_ID) return MOCK_ARTICLES.filter(a => a.sportId === sportId && a.levelId === levelId && a.language === language);
    try {
      const articles = await actor().listArticles(sportId, levelId, language);
      cacheArticles(articles).catch(() => {});
      return articles;
    } catch (e) {
      const cached = (await getCachedArticles()).filter(a => a.sportId === sportId && a.levelId === levelId && a.language === language);
      if (cached.length > 0) return cached;
      throw e;
    }
  },

  async getArticle(id: string): Promise<Article | null> {
    if (!CANISTER_ID) return MOCK_ARTICLES.find(a => a.id === id) ?? null;
    try {
      const res = await actor().getArticle(id);
      return res.length ? res[0] : null;
    } catch (e) {
      const cached = (await getCachedArticles()).find(a => a.id === id);
      if (cached) return cached;
      throw e;
    }
  },

  async listPlays(articleId: string): Promise<CasebookPlay[]> {
    if (!CANISTER_ID) return [];
    try {
      const plays = await actor().listPlays(articleId);
      cachePlays(plays).catch(() => {});
      return plays;
    } catch (e) {
      const cached = await getCachedPlays(articleId);
      if (cached.length > 0) return cached;
      throw e;
    }
  },

  async getArticleAudio(id: string): Promise<Uint8Array | null> {
    if (!CANISTER_ID) return (await getCachedAudioBlob(id)) ?? null;
    try {
      const res = await actor().getArticleAudio(id);
      return res.length ? Uint8Array.from(res[0]) : null;
    } catch (e) {
      const cached = await getCachedAudioBlob(id);
      if (cached) return cached;
      throw e;
    }
  },

  async listPointsOfEmphasis(season: string): Promise<PointOfEmphasis[]> {
    if (!CANISTER_ID) return [];
    try {
      return await actor().listPointsOfEmphasis(season);
    } catch {
      return [];
    }
  },

  async listMechanicsScenarios(): Promise<MechanicsScenario[]> {
    if (!CANISTER_ID) return [];
    try {
      return await actor().listMechanicsScenarios();
    } catch {
      return [];
    }
  },

  async getMechanicsScenario(id: string): Promise<MechanicsScenario | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getMechanicsScenario(id);
    return res.length ? res[0] : null;
  },

  async isAdmin(): Promise<boolean> {
    if (!CANISTER_ID) return false;
    try {
      return await actor().isAdminCaller();
    } catch {
      return false;
    }
  },

  async submitVideoClip(citation: string, clipUrl: string): Promise<VideoSubmission> {
    if (!CANISTER_ID) throw new Error("Content canister not deployed");
    const res = await actor().submitVideoClip(citation, clipUrl);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async getMySubmissions(): Promise<VideoSubmission[]> {
    if (!CANISTER_ID) return [];
    return actor().getMySubmissions();
  },

  async listPendingSubmissions(): Promise<VideoSubmission[]> {
    if (!CANISTER_ID) return [];
    const res = await actor().listPendingSubmissions();
    if ("err" in res) return [];
    return res.ok;
  },

  async approveSubmission(id: string, playId: string): Promise<VideoSubmission> {
    if (!CANISTER_ID) throw new Error("Content canister not deployed");
    const res = await actor().approveSubmission(id, playId);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async rejectSubmission(id: string): Promise<VideoSubmission> {
    if (!CANISTER_ID) throw new Error("Content canister not deployed");
    const res = await actor().rejectSubmission(id);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },
};
