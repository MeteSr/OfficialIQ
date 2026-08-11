import { IDL } from "@icp-sdk/core/candid";
import { createActor } from "./actor";
import { cacheArticles, cachePlays, getCachedArticles, getCachedPlays } from "../lib/offlineDb";

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

export type CasebookPlay = {
  id:        string;
  articleId: string;
  citation:  string;
  scenario:  string;
  ruling:    string;
  audioUrl:  [] | [string];
};

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Art = I.Record({
    id: I.Text, sportId: I.Text, levelId: I.Text, number: I.Nat,
    title: I.Text, body: I.Text, audioUrl: I.Opt(I.Text),
    createdAt: I.Int, updatedAt: I.Int,
  });
  const Play = I.Record({
    id: I.Text, articleId: I.Text, citation: I.Text,
    scenario: I.Text, ruling: I.Text, audioUrl: I.Opt(I.Text),
  });
  return I.Service({
    getArticle:      I.Func([I.Text],         [I.Opt(Art)],           ["query"]),
    getArticleAudio: I.Func([I.Text],         [I.Opt(I.Vec(I.Nat8))], ["query"]),
    listArticles:    I.Func([I.Text, I.Text], [I.Vec(Art)],           ["query"]),
    listPlays:       I.Func([I.Text],         [I.Vec(Play)],          ["query"]),
    metrics:         I.Func([],               [I.Record({ articleCount: I.Nat, playCount: I.Nat })], ["query"]),
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
    getArticle:      (id: string) => Promise<[] | [Article]>;
    getArticleAudio: (id: string) => Promise<[] | [Uint8Array | number[]]>;
    listArticles:    (sportId: string, levelId: string) => Promise<Article[]>;
    listPlays:       (articleId: string) => Promise<CasebookPlay[]>;
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
    if (!CANISTER_ID) return null;
    const res = await actor().getArticleAudio(id);
    if (!res.length) return null;
    return Uint8Array.from(res[0]);
  },
};
