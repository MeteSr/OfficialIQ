import { describe, it, expect } from "vitest";
import { isInLastFiveDaysOfMonth, monthlyWindowDaysLeft } from "./monthlyWindow";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));

describe("monthly exam window", () => {
  it("opens for the last five days of a 30-day month", () => {
    expect(isInLastFiveDaysOfMonth(utc(2026, 11, 25))).toBe(false);
    expect(isInLastFiveDaysOfMonth(utc(2026, 11, 26))).toBe(true);
    expect(monthlyWindowDaysLeft(utc(2026, 11, 26))).toBe(5);
    expect(monthlyWindowDaysLeft(utc(2026, 11, 30))).toBe(1);
  });

  it("handles February in a non-leap year", () => {
    expect(isInLastFiveDaysOfMonth(utc(2027, 2, 24))).toBe(true);
    expect(monthlyWindowDaysLeft(utc(2027, 2, 24))).toBe(5);
    expect(monthlyWindowDaysLeft(utc(2027, 2, 28))).toBe(1);
  });
});
