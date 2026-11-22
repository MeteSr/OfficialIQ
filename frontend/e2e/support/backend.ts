import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { Actor, HttpAgent, type ActorSubclass, type Identity } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory as userIdl } from "../../src/declarations/user";
import { idlFactory as contentIdl } from "../../src/declarations/content";
import { idlFactory as questionIdl } from "../../src/declarations/question";
import { idlFactory as examIdl } from "../../src/declarations/exam";
import { idlFactory as rankingIdl } from "../../src/declarations/ranking";
import { idlFactory as challengeIdl } from "../../src/declarations/challenge";
import { idlFactory as mentorshipIdl } from "../../src/declarations/mentorship";
import { idlFactory as associationIdl } from "../../src/declarations/association";
import { idlFactory as reportIdl } from "../../src/declarations/report";
import { idlFactory as aiProxyIdl } from "../../src/declarations/ai_proxy";

// Direct canister calls for the browser tests: setting up what a person
// can't do from the app (an admin granting a role, switching billing on) and
// checking what the app wrote. Same IDL as the app (src/declarations).

const IDL = {
  user: userIdl, content: contentIdl, question: questionIdl, exam: examIdl, ranking: rankingIdl,
  challenge: challengeIdl, mentorship: mentorshipIdl, association: associationIdl, report: reportIdl,
  ai_proxy: aiProxyIdl,
};
export type CanisterName = keyof typeof IDL;
export const CANISTERS = Object.keys(IDL) as CanisterName[];

// Playwright loads these files as CommonJS (package.json has no "type").
export const REPO_ROOT = resolve(__dirname, "../../..");
export const ICP_ENVIRONMENT = process.env.ICP_ENVIRONMENT ?? "local";
export const ICP_HOST = process.env.ICP_HOST ?? "http://localhost:8000";

export function icp(args: string[]): string {
  return execFileSync("icp", args, { encoding: "utf8", cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** A 32-byte seed as the 64 hex characters the app's dev sign-in reads (src/lib/devIdentity.ts). */
export function seedHex(seed: Uint8Array): string {
  return Buffer.from(seed).toString("hex");
}

export function identityFromHex(hex: string): Ed25519KeyIdentity {
  return Ed25519KeyIdentity.generate(Uint8Array.from(Buffer.from(hex, "hex")));
}

/** The admin of every canister in the test network: the same fixed identity as the canister integration tests. */
export const ADMIN_SEED_HEX = "5a".repeat(32);
export const adminIdentity = () => identityFromHex(ADMIN_SEED_HEX);

let ids: Record<string, string> | null = null;

/** Canister IDs: from globalSetup (E2E_CANISTER_IDS), else asked of icp. */
export function canisterIds(): Record<string, string> {
  if (ids) return ids;
  if (process.env.E2E_CANISTER_IDS) ids = JSON.parse(process.env.E2E_CANISTER_IDS) as Record<string, string>;
  else ids = Object.fromEntries(CANISTERS.map((c) => [c, icp(["canister", "status", c, "-e", ICP_ENVIRONMENT, "--id-only"])]));
  return ids;
}

const agents = new Map<string, Promise<HttpAgent>>();

function agentFor(identity: Identity): Promise<HttpAgent> {
  const key = identity.getPrincipal().toText();
  let a = agents.get(key);
  if (!a) {
    // Fetching the root key is only acceptable against a local test network;
    // the app itself never does this (src/services/actor.ts).
    a = HttpAgent.create({ host: ICP_HOST, identity, shouldFetchRootKey: true });
    agents.set(key, a);
  }
  return a;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyActor = ActorSubclass<Record<string, (...args: any[]) => Promise<any>>>;

export async function canister(name: CanisterName, identity: Identity = adminIdentity()): Promise<AnyActor> {
  return Actor.createActor(IDL[name], { agent: await agentFor(identity), canisterId: canisterIds()[name] });
}

/** The `ok` of a Result, or a thrown error carrying its `err`. */
export function ok<T>(r: { ok: T } | { err: unknown }): T {
  if ("err" in r) throw new Error(`expected ok, got err: ${JSON.stringify(r.err, (_, v) => (typeof v === "bigint" ? String(v) : v))}`);
  return r.ok;
}

export const principalOf = (hex: string) => identityFromHex(hex).getPrincipal();
export { Principal };

// ─── Admin steps a person can't take in the app ──────────────────────────────

export async function grantRole(official: Principal, role: "Coordinator" | "Admin" | "Assessor" | "Official"): Promise<void> {
  ok(await (await canister("user")).setRole(official, { [role]: null }));
}

/** Billing on or off for everyone (user canister, which the others ask). */
export async function setPaywall(on: boolean): Promise<void> {
  ok(await (await canister("user")).setPaywallEnabled(on));
}

/** Pro until `until` (ms), as an admin comp: what a finished Stripe checkout ends in. */
export async function grantPro(official: Principal, untilMs: number): Promise<void> {
  ok(await (await canister("user")).grantComp(official, BigInt(untilMs) * 1_000_000n));
}
