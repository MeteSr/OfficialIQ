import { describe, expect, it } from "vitest";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { DEV_IDENTITY_SEED_KEY, devIdentity, devIdentitySeed } from "./devIdentity";

const store = (value: string | null) => ({ getItem: (k: string) => (k === DEV_IDENTITY_SEED_KEY ? value : null) });
const DEFAULT = new Uint8Array(32).fill(0xab);

describe("devIdentitySeed", () => {
  it("is the fixed dev seed when nothing is stored", () => {
    expect(devIdentitySeed(store(null))).toEqual(DEFAULT);
    expect(devIdentitySeed(undefined)).toEqual(DEFAULT);
  });

  it("uses a stored 32-byte hex seed, so end-to-end tests can sign in as several people", () => {
    expect(devIdentitySeed(store("01".repeat(32)))).toEqual(new Uint8Array(32).fill(1));
    expect(devIdentitySeed(store("  5A".padEnd(66, "5a") + " "))).toEqual(new Uint8Array(32).fill(0x5a));
  });

  it("ignores anything that isn't 64 hex characters", () => {
    expect(devIdentitySeed(store("abc"))).toEqual(DEFAULT);
    expect(devIdentitySeed(store("zz".repeat(32)))).toEqual(DEFAULT);
    expect(devIdentitySeed(store("01".repeat(33)))).toEqual(DEFAULT);
  });

  it("falls back to the dev seed when storage can't be read", () => {
    const throwing = { getItem: () => { throw new Error("blocked"); } };
    expect(devIdentitySeed(throwing)).toEqual(DEFAULT);
  });
});

describe("devIdentity", () => {
  it("is the identity of the seed", () => {
    const seed = "07".repeat(32);
    const expected = Ed25519KeyIdentity.generate(new Uint8Array(32).fill(7)).getPrincipal().toText();
    expect(devIdentity(store(seed)).getPrincipal().toText()).toBe(expected);
  });
});
