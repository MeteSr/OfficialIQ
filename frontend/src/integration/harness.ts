import { Actor, HttpAgent, type Identity, type ActorSubclass } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { inject } from "vitest";
import { idlFactory as examIdl } from "../services/exam";
import { idlFactory as questionIdl } from "../services/question";
import { idlFactory as rankingIdl } from "../services/ranking";
import { idlFactory as challengeIdl } from "../services/challenge";
import { idlFactory as associationIdl } from "../services/association";
import { idlFactory as userIdl } from "../services/user";
import { adminIdentity } from "./identities";

// Calls go through the app's own hand-written IDL (src/services/*), so a
// canister change the app's IDL doesn't match fails here too.
//
// Methods the app never calls (admin and canister-to-canister ones) get a
// small IDL of their own below; `reserved` decodes any value we don't inspect.

const adminExtras: Record<string, IDL.InterfaceFactory> = {
  question: ({ IDL: I }) => I.Service({
    questionsForExam: I.Func([I.Vec(I.Text)], [I.Variant({ ok: I.Reserved, err: I.Text })], []),
  }),
  user: ({ IDL: I }) => I.Service({
    setRole: I.Func(
      [I.Principal, I.Variant({ Admin: I.Null, Assessor: I.Null, Coordinator: I.Null, Official: I.Null })],
      [I.Variant({ ok: I.Reserved, err: I.Text })], [],
    ),
  }),
};

const appIdl: Record<string, IDL.InterfaceFactory> = {
  exam: examIdl, question: questionIdl, ranking: rankingIdl,
  challenge: challengeIdl, association: associationIdl, user: userIdl,
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

export async function adminCall(name: "question" | "user", identity: Identity = adminIdentity()): Promise<AnyActor> {
  return Actor.createActor(adminExtras[name], { agent: await agentFor(identity), canisterId: inject("canisterIds")[name] });
}

/** The `ok` of a Result, or a thrown error carrying its `err`. */
export function ok<T>(r: { ok: T } | { err: string }): T {
  if ("err" in r) throw new Error(`expected ok, got err: ${r.err}`);
  return r.ok;
}

/** The `err` text of a Result that should have failed. */
export function err(r: { ok: unknown } | { err: string }): string {
  if (!("err" in r)) throw new Error("expected err, got ok");
  return r.err;
}
