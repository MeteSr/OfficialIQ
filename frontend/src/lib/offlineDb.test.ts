import { describe, it, expect } from "vitest";
import {
  cacheArticles, getCachedArticles,
  cachePlays, getCachedPlays,
  cacheQuestions, getCachedQuestion, getCachedQuestionsFor,
  enqueuePendingAction, getPendingActions, removePendingAction, pendingActionCount,
} from "./offlineDb";
import type { Article, CasebookPlay } from "../services/content";
import type { Question } from "../services/question";

function makeArticle(id: string, number: bigint): Article {
  return { id, sportId: "ncaa_basketball", levelId: "varsity", number, title: `Article ${number}`, body: "body text", audioUrl: [], createdAt: 0n, updatedAt: 0n };
}

function makeQuestion(id: string, articleId: string, isCasebook: boolean): Question {
  return {
    id, sportId: "ncaa_basketball", articleId, citation: "Art. X",
    stem: `stem ${id}`, choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
    correctId: "a", explanation: "because", difficulty: { Beginner: null }, isCasebook, isPointOfEmphasis: false, createdAt: 0n,
  };
}

describe("offlineDb: article cache", () => {
  it("round-trips cached articles", async () => {
    const a1 = makeArticle("test:art1", 1n);
    const a2 = makeArticle("test:art2", 2n);
    await cacheArticles([a1, a2]);

    const all = await getCachedArticles();
    expect(all.find(a => a.id === "test:art1")).toEqual(a1);
    expect(all.find(a => a.id === "test:art2")).toEqual(a2);
  });

  it("overwrites an article cached under the same id", async () => {
    const original = makeArticle("test:overwrite", 9n);
    await cacheArticles([original]);
    const updated = { ...original, title: "Updated title" };
    await cacheArticles([updated]);

    const all = await getCachedArticles();
    const matches = all.filter(a => a.id === "test:overwrite");
    expect(matches).toHaveLength(1);
    expect(matches[0].title).toBe("Updated title");
  });
});

describe("offlineDb: casebook play cache", () => {
  it("indexes plays by articleId", async () => {
    const playA: CasebookPlay = { id: "test:playA", articleId: "test:art-plays-1", citation: "c1", scenario: "s1", ruling: "r1", audioUrl: [], diagram: [] };
    const playB: CasebookPlay = { id: "test:playB", articleId: "test:art-plays-2", citation: "c2", scenario: "s2", ruling: "r2", audioUrl: [], diagram: [] };
    await cachePlays([playA, playB]);

    const forArt1 = await getCachedPlays("test:art-plays-1");
    expect(forArt1.map(p => p.id)).toContain("test:playA");
    expect(forArt1.map(p => p.id)).not.toContain("test:playB");
  });
});

describe("offlineDb: question cache", () => {
  it("filters cached questions by article, casebook flag, and count", async () => {
    const artId = "test:art-questions";
    const rule1 = makeQuestion("test:q-rule-1", artId, false);
    const rule2 = makeQuestion("test:q-rule-2", artId, false);
    const casebook1 = makeQuestion("test:q-case-1", artId, true);
    const otherArticle = makeQuestion("test:q-other", "test:art-other", false);
    await cacheQuestions([rule1, rule2, casebook1, otherArticle]);

    const rules = await getCachedQuestionsFor([artId], false, 10);
    expect(rules.map(q => q.id).sort()).toEqual(["test:q-rule-1", "test:q-rule-2"]);

    const casebookOnly = await getCachedQuestionsFor([artId], true, 10);
    expect(casebookOnly.map(q => q.id)).toEqual(["test:q-case-1"]);

    const limited = await getCachedQuestionsFor([artId], false, 1);
    expect(limited).toHaveLength(1);
  });

  it("retrieves a single cached question by id", async () => {
    const q = makeQuestion("test:q-single", "test:art-single", false);
    await cacheQuestions([q]);
    const found = await getCachedQuestion("test:q-single");
    expect(found).toEqual(q);
    expect(await getCachedQuestion("test:does-not-exist")).toBeUndefined();
  });
});

describe("offlineDb: pending actions queue", () => {
  it("enqueues, lists in creation order, and removes actions", async () => {
    const before = await pendingActionCount();

    await enqueuePendingAction({ kind: "recordArticleStudied", articleId: "test:art-queue", score: 80 });
    await enqueuePendingAction({ kind: "recordExamResult", score: 90, questionCount: 10, displayName: "Tester", sport: "ncaa_basketball", state: "TX", avgElapsedSec: 20 });

    const afterEnqueue = await getPendingActions();
    expect(afterEnqueue.length).toBe(before + 2);

    const studiedAction = afterEnqueue.find(a => a.kind === "recordArticleStudied" && a.articleId === "test:art-queue");
    expect(studiedAction).toBeDefined();
    if (studiedAction && studiedAction.kind === "recordArticleStudied") {
      expect(studiedAction.score).toBe(80);
      await removePendingAction(studiedAction.id);
    }

    const afterRemove = await getPendingActions();
    expect(afterRemove.length).toBe(before + 1);
    expect(afterRemove.some(a => a.kind === "recordArticleStudied" && a.articleId === "test:art-queue")).toBe(false);
  });

  it("orders pending actions by creation time", async () => {
    await enqueuePendingAction({ kind: "recordArticleStudied", articleId: "test:art-order-1", score: 50 });
    await new Promise(r => setTimeout(r, 2));
    await enqueuePendingAction({ kind: "recordArticleStudied", articleId: "test:art-order-2", score: 60 });

    const all = await getPendingActions();
    const i1 = all.findIndex(a => a.kind === "recordArticleStudied" && a.articleId === "test:art-order-1");
    const i2 = all.findIndex(a => a.kind === "recordArticleStudied" && a.articleId === "test:art-order-2");
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThan(i1);
  });
});
