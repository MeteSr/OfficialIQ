import { Actor, HttpAgent, type Identity, type ActorSubclass } from "@icp-sdk/core/agent";
import { inject } from "vitest";
import { idlFactory as examIdl } from "../declarations/exam";
import { idlFactory as questionIdl } from "../declarations/question";
import { idlFactory as rankingIdl } from "../declarations/ranking";
import { idlFactory as challengeIdl } from "../declarations/challenge";
import { idlFactory as associationIdl } from "../declarations/association";
import { idlFactory as userIdl } from "../declarations/user";
import { idlFactory as aiProxyIdl } from "../declarations/ai_proxy";
import { idlFactory as contentIdl } from "../declarations/content";
import { adminIdentity } from "./identities";

// Calls go through the IDL the app uses (src/declarations, generated from
// the canisters by scripts/generate-declarations.sh), so admin and
// canister-to-canister methods are callable too.

const appIdl = {
  exam: examIdl, question: questionIdl, ranking: rankingIdl,
  challenge: challengeIdl, association: associationIdl, user: userIdl,
  ai_proxy: aiProxyIdl, content: contentIdl,
};

const agents = new Map<Identity, Promise<HttpAgent>>();

function agentFor(identity: Identity): Promise<HttpAgent> {
  let a = agents.get(identity);
  if (!a) {
    // Fetching the root key is only acceptable against a local test network;
    // the app itself never does this (see src/services/actor.ts).
    a = HttpAgent.create({ host: inject("host"), identity, shouldFetchRootKey: true });
    agents.set(identity, a);
  }
  return a;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyActor = ActorSubclass<Record<string, (...args: any[]) => Promise<any>>>;

export async function canister(name: keyof typeof appIdl, identity: Identity): Promise<AnyActor> {
  return Actor.createActor(appIdl[name], { agent: await agentFor(identity), canisterId: inject("canisterIds")[name] });
}

export async function adminCall(name: "question" | "user" | "content" | "ai_proxy" | "association", identity: Identity = adminIdentity()): Promise<AnyActor> {
  return Actor.createActor(appIdl[name], { agent: await agentFor(identity), canisterId: inject("canisterIds")[name] });
}

/** The `ok` of a Result, or a thrown error carrying its `err`. */
export function ok<T>(r: { ok: T } | { err: unknown }): T {
  if ("err" in r) throw new Error(`expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}

/** The `err` of a Result that should have failed (text, or a variant). */
export function err<E = string>(r: { ok: unknown } | { err: E }): E {
  if (!("err" in r)) throw new Error("expected err, got ok");
  return r.err;
}
