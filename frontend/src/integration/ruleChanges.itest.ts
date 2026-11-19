import { beforeAll, describe, expect, it } from "vitest";
import { canister, adminCall, ok, err } from "./harness";
import { newIdentity } from "./identities";
import { seedBank, config, type Bank } from "./fixtures";

// "What changed this season" (issue #68): rule changes per sport + season,
// and a graded quiz on only the questions tagged for those changes. The
// wording here is test data, not rulebook text.

let bank: Bank;
beforeAll(async () => { bank = await seedBank(8, 0); });

const input = (season: string, over: Record<string, unknown> = {}) => ({
  sportId: bank.sportId, season, articleId: bank.art1, citation: "Rule 1-1",
  title: "Test change", oldText: "Old test wording", newText: "New test wording",
  summary: "What the change means", source: "Test edition", ...over,
});

describe("rule changes", () => {
  it("lets admins add, edit and remove changes, listed per sport and season", async () => {
    const content = await adminCall("content");
    const a = ok(await content.upsertRuleChange([], input("2030-31"))) as { id: string };
    ok(await content.upsertRuleChange([], input("2030-31", { title: "Second" })));
    ok(await content.upsertRuleChange([], input("2031-32")));

    const anyone = await canister("content", newIdentity());
    const listed = (await anyone.listRuleChanges(bank.sportId, "2030-31")) as { id: string; title: string; newText: string }[];
    expect(listed.map(c => c.title).sort()).toEqual(["Second", "Test change"]);
    expect(await anyone.listRuleChanges(bank.sportId, "2029-30")).toEqual([]);
    expect(await anyone.listRuleChanges("some_other_sport", "2030-31")).toEqual([]);

    const edited = ok(await content.upsertRuleChange([a.id], input("2030-31", { newText: "Edited" }))) as { id: string; newText: string };
    expect(edited).toMatchObject({ id: a.id, newText: "Edited" });
    expect((await anyone.listRuleChanges(bank.sportId, "2030-31")) as unknown[]).toHaveLength(2);

    ok(await content.deleteRuleChange(a.id));
    expect(((await anyone.listRuleChanges(bank.sportId, "2030-31")) as { title: string }[]).map(c => c.title)).toEqual(["Second"]);
    expect(err(await content.deleteRuleChange(a.id))).toEqual({ notFound: null });
    expect(err(await content.upsertRuleChange(["nope"], input("2030-31")))).toEqual({ notFound: null });
  });

  it("refuses non-admins and incomplete changes", async () => {
    const official = await canister("content", newIdentity());
    expect(err(await official.upsertRuleChange([], input("2030-31")))).toEqual({ notAdmin: null });
    expect(err(await official.deleteRuleChange("rc0"))).toEqual({ notAdmin: null });
    const content = await adminCall("content");
    expect(err(await content.upsertRuleChange([], input("2030-31", { newText: "  " })))).toEqual({ invalid: "newText" });
    expect(err(await content.upsertRuleChange([], input("", {})))).toEqual({ invalid: "season" });
    expect(err(await content.upsertRuleChange([], input("2030-31", { articleId: "" })))).toEqual({ invalid: "articleId" });
  });

  it("quizzes only the questions tagged for the season's changes", async () => {
    const tag = "rule-change:2030-31";
    const q = await adminCall("question");
    const tagged = bank.ruleIds.slice(0, 3);
    for (const id of tagged) ok(await q.setQuestionTags(id, [tag]));
    expect(err(await (await canister("question", newIdentity())).setQuestionTags(bank.ruleIds[0], [tag]))).toEqual({ notAdmin: null });
    expect(err(await q.setQuestionTags("no-such-question", [tag]))).toEqual({ notFound: null });

    const exam = await canister("exam", newIdentity());
    const s = ok(await exam.startGradedSession(config(bank, 3), {
      Picks: [{ articleIds: [bank.art1], casebook: false, count: 8n, difficulty: [], adaptive: false, tag: [tag] }],
    })) as { session: { questionIds: string[] } };
    expect([...s.session.questionIds].sort()).toEqual([...tagged].sort());

    // A pick without a tag still draws from every question on the article.
    const all = ok(await exam.startGradedSession(config(bank, 8), {
      Picks: [{ articleIds: [bank.art1], casebook: false, count: 8n, difficulty: [], adaptive: false, tag: [] }],
    })) as { session: { questionIds: string[] } };
    expect(all.session.questionIds).toHaveLength(8);
  });
});
