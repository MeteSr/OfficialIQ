import { afterEach, describe, expect, it, vi } from "vitest";

const native = vi.fn(() => false);
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native(), getPlatform: () => (native() ? "ios" : "web") } }));

import { purchasesAllowed } from "./purchases";

describe("purchasesAllowed", () => {
  afterEach(() => native.mockReset());
  it("is true on the website", () => {
    native.mockReturnValue(false);
    expect(purchasesAllowed()).toBe(true);
  });
  it("is false in the Android and iOS apps, which show no prices or purchase links", () => {
    native.mockReturnValue(true);
    expect(purchasesAllowed()).toBe(false);
  });
});
