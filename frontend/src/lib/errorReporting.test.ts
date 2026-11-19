import { describe, expect, it } from "vitest";
import { routeShape, scrub } from "./errorReporting";

describe("error reports carry nothing identifying", () => {
  it("strips principals and canister ids", () => {
    expect(scrub("Call failed: Sender 7hfb6-caaaa-aaaar-qadga-cai rejected for 2vxsx-fae"))
      .toBe("Call failed: Sender <principal> rejected for <principal>");
  });

  it("strips email addresses", () => {
    expect(scrub("no profile for ref@example.org")).toBe("no profile for <email>");
  });

  it("keeps ordinary words", () => {
    expect(scrub("TypeError: Cannot read properties of undefined (reading 'score')"))
      .toBe("TypeError: Cannot read properties of undefined (reading 'score')");
  });

  it("drops ids and tokens from the route", () => {
    expect(routeShape("/mentor/Zk3x9QpLw2Rt7YvB")).toBe("/mentor/:x");
    expect(routeShape("/quiz/ncaa_basketball:art4")).toBe("/quiz/:x");
    expect(routeShape("/report/rpt12")).toBe("/report/:x");
    expect(routeShape("/me")).toBe("/me");
  });
});
