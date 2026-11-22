import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";

// The identity `vite dev` signs in with instead of Internet Identity
// (AuthContext). Only reachable behind `import.meta.env.DEV`, so production
// builds never contain a way in without Internet Identity.
//
// By default it's one fixed identity, which survives hot reloads. A 32-byte
// hex seed stored under DEV_IDENTITY_SEED_KEY picks another one: the browser
// end-to-end tests (frontend/e2e) set it to sign in as several officials.

export const DEV_IDENTITY_SEED_KEY = "officialiq.devIdentitySeed";

const DEFAULT_SEED = new Uint8Array(32).fill(0xab);

type SeedStore = { getItem(key: string): string | null };

export function devIdentitySeed(store: SeedStore | undefined): Uint8Array {
  let raw: string | null = null;
  try {
    raw = store?.getItem(DEV_IDENTITY_SEED_KEY) ?? null;
  } catch {
    // Storage blocked: use the default identity.
  }
  const hex = raw?.trim() ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return DEFAULT_SEED;
  return Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
}

export function devIdentity(
  store: SeedStore | undefined = typeof localStorage !== "undefined" ? localStorage : undefined,
): Ed25519KeyIdentity {
  return Ed25519KeyIdentity.generate(devIdentitySeed(store));
}
