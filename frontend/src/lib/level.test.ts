import { describe, expect, it } from "vitest";
import { forLevel } from "./level";

describe("forLevel", () => {
  it("matches an article at the level, or one for every level (no level)", () => {
    expect(forLevel({ levelId: "varsity" }, "varsity")).toBe(true);
    expect(forLevel({ levelId: "" }, "collegiate")).toBe(true);
    expect(forLevel({ levelId: "jv" }, "varsity")).toBe(false);
  });
});
