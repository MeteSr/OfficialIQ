import { Actor, HttpAgent, type Identity } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";

const IS_DEV  = import.meta.env.DEV;
const IC_HOST = IS_DEV ? "http://127.0.0.1:4943" : "https://ic0.app";

// Fixed-seed dev identity — survives hot-reloads without re-auth
const DEV_SEED = new Uint8Array(32).fill(0xab);

let _agent: HttpAgent | null = null;

/** Called by AuthContext after Internet Identity login. */
export function initAgent(identity: Identity): void {
  _agent = new HttpAgent({ host: IC_HOST, identity });
}

/** Returns the current agent, creating a dev/anonymous one if not yet initialised. */
export function getAgent(): HttpAgent {
  if (_agent) return _agent;
  const identity = IS_DEV ? Ed25519KeyIdentity.generate(DEV_SEED) : undefined;
  const agent = new HttpAgent({ host: IC_HOST, identity });
  if (IS_DEV) {
    // Fetch root key for local replica (never in production)
    agent.fetchRootKey().catch(() => {});
  }
  _agent = agent;
  return agent;
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
