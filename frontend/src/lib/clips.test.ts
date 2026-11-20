import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RIGHTS_STATEMENT, atCall, clipInput, formProblems, groupByRule, seekLimit, type ClipForm } from "./clips";

const form: ClipForm = {
  uploadId: "uid1", sportId: "s", articleId: "s:art4", sectionKey: "s:art4:s1", playId: "",
  title: "Block or charge", description: "",
  makeTheCall: true, callAtSec: "7", stem: "What's the call?",
  choices: ["Block", "Charge", "", ""], correctIndex: 1, explanation: "Set before contact.",
  visibility: "everyone", rightsAttested: true,
};

describe("you make the call", () => {
  it("stops at the call until it's answered, and won't skip past it", () => {
    expect(atCall(6.9, 7, false)).toBe(false);
    expect(atCall(7.05, 7, false)).toBe(true);
    expect(atCall(9, 7, true)).toBe(false);
    expect(atCall(9, null, false)).toBe(false);
    expect(seekLimit(12, 7, false)).toBe(7);
    expect(seekLimit(12, 7, true)).toBe(12);
    expect(seekLimit(3, 7, false)).toBe(3);
  });
});

describe("the upload form", () => {
  it("builds the canister's clip input, keeping only filled-in choices", () => {
    expect(clipInput(form)).toEqual({
      uploadId: "uid1", sportId: "s", articleId: "s:art4", sectionKey: ["s:art4:s1"], playId: [],
      title: "Block or charge", description: "", callAtSec: [7n],
      question: [{ stem: "What's the call?", choices: [{ id: "a", text: "Block" }, { id: "b", text: "Charge" }], correctId: "b", explanation: "Set before contact." }],
      visibility: { everyone: null }, rightsAttested: true,
    });
    expect(clipInput({ ...form, makeTheCall: false, visibility: "a1" })).toMatchObject({ callAtSec: [], question: [], visibility: { association: "a1" } });
  });

  it("says what's missing before anything is sent", () => {
    expect(formProblems(form)).toEqual([]);
    expect(formProblems({ ...form, rightsAttested: false, title: " " })).toEqual(["title", "rights"]);
    expect(formProblems({ ...form, callAtSec: "x", choices: ["Block", "", "", ""] })).toEqual(["callAtSec", "choices"]);
    expect(formProblems({ ...form, correctIndex: 2 })).toEqual(["correct"]);
  });

  it("asks for the same rights statement the canister records", () => {
    const backend = readFileSync(resolve(__dirname, "../../../backend/lib/Clips.mo"), "utf8");
    expect(backend).toContain(`RIGHTS_STATEMENT : Text = "${RIGHTS_STATEMENT}"`);
  });
});

describe("groupByRule", () => {
  it("groups clips under their rule, in rule order", () => {
    const c = (id: string, articleId: string) => ({ id, articleId });
    expect(groupByRule([c("x", "s:art10"), c("y", "s:art2"), c("z", "s:art10")]).map(g => [g.articleId, g.clips.map(x => x.id)]))
      .toEqual([["s:art2", ["y"]], ["s:art10", ["x", "z"]]]);
  });
});
