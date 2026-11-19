import { describe, expect, it } from "vitest";
import { currentSeason, ruleChangeTag, showRuleChangesOnHome } from "./ruleChanges";

describe("currentSeason", () => {
  it("starts a season on August 1", () => {
    expect(currentSeason(new Date(2026, 7, 1).getTime())).toBe("2026-27");
    expect(currentSeason(new Date(2026, 6, 31).getTime())).toBe("2025-26");
    expect(currentSeason(new Date(2099, 11, 31).getTime())).toBe("2099-00");
  });
});

it("tags a season's change questions", () => {
  expect(ruleChangeTag("2026-27")).toBe("rule-change:2026-27");
});

describe("showRuleChangesOnHome", () => {
  it("shows for the first eight weeks of the season when there are changes", () => {
    expect(showRuleChangesOnHome(new Date(2026, 7, 3).getTime(), 2)).toBe(true);
    expect(showRuleChangesOnHome(new Date(2026, 8, 25).getTime(), 2)).toBe(true);
    expect(showRuleChangesOnHome(new Date(2026, 9, 1).getTime(), 2)).toBe(false);
  });
  it("hides when the season has no changes", () => {
    expect(showRuleChangesOnHome(new Date(2026, 7, 3).getTime(), 0)).toBe(false);
  });
});
