import { describe, expect, it } from "vitest";
import { canister, adminCall, ok, err } from "./harness";
import { newIdentity } from "./identities";

// Importing a rulebook edition (the NCAA import, scripts/seed-ncaa.mjs):
// each rule's approved rulings and each sport's points of emphasis are
// replaced as a set, so re-running an import changes nothing and a new
// edition retires what it no longer has. The wording here is test data.

const sportId = `import_test_${Date.now()}`;
const articleId = `${sportId}:art1`;
const play = (citation: string, ruling = "Legal.") => ({ articleId, citation, scenario: `Facts for ${citation}.`, ruling, diagram: [] });
type Play = { id: string; citation: string; ruling: string };
type Poe = { id: string; title: string; body: string; season: string };

describe("importing approved rulings", () => {
  it("replaces an article's plays, keeping the id of a play it still has", async () => {
    const content = await adminCall("content");
    ok(await content.upsertPlay(play("Practice play")));
    expect(ok(await content.replacePlays(articleId, [play("A.R. 1-1"), play("A.R. 1-2")]))).toEqual({ added: 2n, updated: 0n, removed: 1n });

    const anyone = await canister("content", newIdentity());
    const first = (await anyone.listPlays(articleId)) as Play[];
    expect(first.map(p => p.citation).sort()).toEqual(["A.R. 1-1", "A.R. 1-2"]);

    // The next edition: one ruling reworded, one dropped, one new.
    expect(ok(await content.replacePlays(articleId, [play("A.R. 1-1", "Illegal."), play("A.R. 1-3")]))).toEqual({ added: 1n, updated: 1n, removed: 1n });
    const second = (await anyone.listPlays(articleId)) as Play[];
    expect(second.map(p => p.citation).sort()).toEqual(["A.R. 1-1", "A.R. 1-3"]);
    const kept = second.find(p => p.citation === "A.R. 1-1")!;
    expect(kept.id).toBe(first.find(p => p.citation === "A.R. 1-1")!.id);
    expect(kept.ruling).toBe("Illegal.");

    // Running the same import again changes nothing.
    expect(ok(await content.replacePlays(articleId, [play("A.R. 1-1", "Illegal."), play("A.R. 1-3")]))).toEqual({ added: 0n, updated: 2n, removed: 0n });
    expect((await anyone.listPlays(articleId)) as Play[]).toHaveLength(2);
  });

  it("refuses non-admins and plays for another article", async () => {
    const official = await canister("content", newIdentity());
    expect(err(await official.replacePlays(articleId, []))).toBe("Admin only");
    const content = await adminCall("content");
    expect(err(await content.replacePlays(articleId, [{ ...play("A.R. 1-9"), articleId: `${sportId}:art2` }]))).toMatch(/articleId/);
  });
});

describe("importing points of emphasis", () => {
  it("replaces a sport's points for a season, listed per sport", async () => {
    const content = await adminCall("content");
    const poe = (title: string, body = "Body.") => ({ season: "2030-31", title, body, linkedArticleIds: [articleId] });
    expect(ok(await content.replacePointsOfEmphasis(sportId, "2030-31", [poe("Spacing"), poe("Clocks")]))).toEqual({ added: 2n, updated: 0n, removed: 0n });
    expect(ok(await content.replacePointsOfEmphasis(`${sportId}_other`, "2030-31", [poe("Other sport")]))).toMatchObject({ added: 1n });

    const anyone = await canister("content", newIdentity());
    const listed = (await anyone.listSportPointsOfEmphasis(sportId, "2030-31")) as Poe[];
    expect(listed.map(p => p.title).sort()).toEqual(["Clocks", "Spacing"]);
    expect(await anyone.listSportPointsOfEmphasis(sportId, "2029-30")).toEqual([]);

    expect(ok(await content.replacePointsOfEmphasis(sportId, "2030-31", [poe("Spacing", "Reworded.")]))).toEqual({ added: 0n, updated: 1n, removed: 1n });
    const after = (await anyone.listSportPointsOfEmphasis(sportId, "2030-31")) as Poe[];
    expect(after.map(p => [p.title, p.body])).toEqual([["Spacing", "Reworded."]]);
    expect(after[0].id).toBe(listed.find(p => p.title === "Spacing")!.id);
    expect(((await anyone.listSportPointsOfEmphasis(`${sportId}_other`, "2030-31")) as Poe[]).map(p => p.title)).toEqual(["Other sport"]);

    expect(err(await (await canister("content", newIdentity())).replacePointsOfEmphasis(sportId, "2030-31", []))).toBe("Admin only");
    expect(err(await content.replacePointsOfEmphasis(sportId, "2030-31", [{ ...poe("X"), season: "2031-32" }]))).toMatch(/season/);
  });
});

describe("an article for every level", () => {
  it("lists an article with no level under each of the sport's levels", async () => {
    const content = await adminCall("content");
    ok(await content.upsertArticle({ sportId, levelId: "", number: 7n, title: "All levels", body: "Body.", language: "en" }));
    ok(await content.upsertArticle({ sportId, levelId: "jv", number: 8n, title: "JV only", body: "Body.", language: "en" }));
    const anyone = await canister("content", newIdentity());
    const titles = async (level: string) => ((await anyone.listArticles(sportId, level, "en")) as { title: string }[]).map(a => a.title).sort();
    expect(await titles("varsity")).toEqual(["All levels"]);
    expect(await titles("jv")).toEqual(["All levels", "JV only"]);
  });
});
