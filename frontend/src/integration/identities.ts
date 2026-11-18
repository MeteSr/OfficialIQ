import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";

/** The test admin: fixed, so globalSetup and the tests agree on it. */
export function adminIdentity(): Ed25519KeyIdentity {
  return Ed25519KeyIdentity.generate(new Uint8Array(32).fill(0x5a));
}

/** A fresh official for one test, so re-runs never see an earlier run's state. */
export function newIdentity(): Ed25519KeyIdentity {
  return Ed25519KeyIdentity.generate();
}
