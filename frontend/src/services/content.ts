import { IDL } from "@icp-sdk/core/candid";
import { createActor } from "./actor";
import { cacheArticles, cachePlays, getCachedArticles, getCachedPlays, getCachedAudioBlob } from "../lib/offlineDb";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Article = {
  id:        string;
  sportId:   string;
  levelId:   string;
  number:    bigint;
  title:     string;
  body:      string;
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

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Art = I.Record({
    id: I.Text, sportId: I.Text, levelId: I.Text, number: I.Nat,
    title: I.Text, body: I.Text, audioUrl: I.Opt(I.Text),
    createdAt: I.Int, updatedAt: I.Int,
  });
  const DiagramPlayer = I.Record({
    id: I.Text, x: I.Nat, y: I.Nat, shortLabel: I.Text, role: I.Text,
  });
  const DiagramArrow = I.Record({ fromId: I.Text, toId: I.Text, style: I.Text });
  const Diagram = I.Record({ players: I.Vec(DiagramPlayer), arrows: I.Vec(DiagramArrow) });
  const Play = I.Record({
    id: I.Text, articleId: I.Text, citation: I.Text,
    scenario: I.Text, ruling: I.Text, audioUrl: I.Opt(I.Text), diagram: I.Opt(Diagram),
    videoUrl: I.Opt(I.Text),
  });
  const Poe = I.Record({
    id: I.Text, season: I.Text, title: I.Text, body: I.Text,
    linkedArticleIds: I.Vec(I.Text), audioUrl: I.Opt(I.Text), createdAt: I.Int,
  });
  const MechanicsZone = I.Record({
    id: I.Text, x: I.Nat, y: I.Nat, width: I.Nat, height: I.Nat, correctOfficial: I.Text,
  });
  const Scenario = I.Record({
    id: I.Text, crewSize: I.Nat, title: I.Text, description: I.Text,
    players: I.Vec(DiagramPlayer), zones: I.Vec(MechanicsZone), createdAt: I.Int,
  });
  const Status = I.Variant({ Pending: I.Null, Approved: I.Null, Rejected: I.Null });
  const Submission = I.Record({
    id: I.Text, submitter: I.Principal, citation: I.Text, clipUrl: I.Text,
    status: Status, linkedPlayId: I.Opt(I.Text), createdAt: I.Int, reviewedAt: I.Opt(I.Int),
  });
  const ResultSubmission = I.Variant({ ok: Submission, err: I.Text });
  const ResultSubmissions = I.Variant({ ok: I.Vec(Submission), err: I.Text });
  return I.Service({
    getArticle:          I.Func([I.Text],         [I.Opt(Art)],           ["query"]),
    getArticleAudio:     I.Func([I.Text],         [I.Opt(I.Vec(I.Nat8))], ["query"]),
    listArticles:        I.Func([I.Text, I.Text], [I.Vec(Art)],           ["query"]),
    listPlays:           I.Func([I.Text],         [I.Vec(Play)],          ["query"]),
    listPointsOfEmphasis: I.Func([I.Text],        [I.Vec(Poe)],           ["query"]),
    listMechanicsScenarios: I.Func([],            [I.Vec(Scenario)],      ["query"]),
    getMechanicsScenario: I.Func([I.Text],        [I.Opt(Scenario)],      ["query"]),
    isAdminCaller:        I.Func([],              [I.Bool],               ["query"]),
    submitVideoClip:      I.Func([I.Text, I.Text], [ResultSubmission],    []),
    getMySubmissions:     I.Func([],              [I.Vec(Submission)],    ["query"]),
    listPendingSubmissions: I.Func([],            [ResultSubmissions],    ["query"]),
    approveSubmission:    I.Func([I.Text, I.Text], [ResultSubmission],    []),
    rejectSubmission:     I.Func([I.Text],        [ResultSubmission],     []),
    metrics:             I.Func([],               [I.Record({ articleCount: I.Nat, playCount: I.Nat })], ["query"]),
  });
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_ARTICLES: Article[] = [
  { id: "ncaa_basketball:art1", sportId: "ncaa_basketball", levelId: "varsity", number: 1n, title: "Court and Equipment",  body: "Rule text for Article 1...", audioUrl: [], createdAt: 0n, updatedAt: 0n },
  { id: "ncaa_basketball:art2", sportId: "ncaa_basketball", levelId: "varsity", number: 2n, title: "Players and Rosters",  body: "Rule text for Article 2...", audioUrl: [], createdAt: 0n, updatedAt: 0n },
  { id: "ncaa_basketball:art3", sportId: "ncaa_basketball", levelId: "varsity", number: 3n, title: "Officials",            body: "Rule text for Article 3...", audioUrl: [], createdAt: 0n, updatedAt: 0n },
  { id: "ncaa_basketball:art4", sportId: "ncaa_basketball", levelId: "varsity", number: 4n, title: "Fouls",                body: "Rule text for Article 4...", audioUrl: [], createdAt: 0n, updatedAt: 0n },
  { id: "ncaa_basketball:art5", sportId: "ncaa_basketball", levelId: "varsity", number: 5n, title: "Violations",           body: "Rule text for Article 5...", audioUrl: [], createdAt: 0n, updatedAt: 0n },
];

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_CONTENT !== "undefined" ? CANISTER_ID_CONTENT : "";

function actor() {
  return createActor<{
    getArticle:           (id: string) => Promise<[] | [Article]>;
    getArticleAudio:      (id: string) => Promise<[] | [Uint8Array | number[]]>;
    listArticles:         (sportId: string, levelId: string) => Promise<Article[]>;
    listPlays:            (articleId: string) => Promise<CasebookPlay[]>;
    listPointsOfEmphasis: (season: string) => Promise<PointOfEmphasis[]>;
    listMechanicsScenarios: () => Promise<MechanicsScenario[]>;
    getMechanicsScenario: (id: string) => Promise<[] | [MechanicsScenario]>;
    isAdminCaller:        () => Promise<boolean>;
    submitVideoClip:      (citation: string, clipUrl: string) => Promise<{ ok: VideoSubmission } | { err: string }>;
    getMySubmissions:     () => Promise<VideoSubmission[]>;
    listPendingSubmissions: () => Promise<{ ok: VideoSubmission[] } | { err: string }>;
    approveSubmission:    (id: string, playId: string) => Promise<{ ok: VideoSubmission } | { err: string }>;
    rejectSubmission:     (id: string) => Promise<{ ok: VideoSubmission } | { err: string }>;
  }>(CANISTER_ID, idlFactory);
}

export const contentService = {
  async listArticles(sportId: string, levelId: string): Promise<Article[]> {
    if (!CANISTER_ID) return MOCK_ARTICLES.filter(a => a.sportId === sportId && a.levelId === levelId);
    try {
      const articles = await actor().listArticles(sportId, levelId);
      cacheArticles(articles).catch(() => {});
      return articles;
    } catch (e) {
      const cached = (await getCachedArticles()).filter(a => a.sportId === sportId && a.levelId === levelId);
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
