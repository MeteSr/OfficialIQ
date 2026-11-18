import { Actor, HttpAgent, type Identity } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { IC_HOST, IC_ROOT_KEY } from "../lib/icEnv";

// Fixed-seed dev identity — survives hot-reloads without re-auth
const DEV_SEED = new Uint8Array(32).fill(0xab);

let _agent: HttpAgent | null = null;

// Root key comes from the `ic_env` cookie, never from fetchRootKey()
// (canister-security skill): fetching it at runtime would let a
// man-in-the-middle substitute its own key.
function makeAgent(identity?: Identity): HttpAgent {
  return HttpAgent.createSync({ identity, host: IC_HOST, rootKey: IC_ROOT_KEY });
}

/** Called by AuthContext after Internet Identity login. */
export function initAgent(identity: Identity): void {
  _agent = makeAgent(identity);
}

/** Returns the current agent, creating a dev/anonymous one if not yet initialised. */
export function getAgent(): HttpAgent {
  if (_agent) return _agent;
  _agent = makeAgent(import.meta.env.DEV ? Ed25519KeyIdentity.generate(DEV_SEED) : undefined);
  return _agent;
}

export function resetAgent(): void {
  _agent = null;
}

export function createActor<T>(
  canisterId: string,
  idlFactory: Parameters<typeof Actor.createActor>[0],
): T {
  return Actor.createActor<T>(idlFactory, { agent: getAgent(), canisterId });
}
