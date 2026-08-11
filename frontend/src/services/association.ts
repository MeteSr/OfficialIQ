import { IDL } from "@icp-sdk/core/candid";
import { createActor } from "./actor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssociationRec = {
  id:          string;
  name:        string;
  sport:       string;
  coordinator: import("@icp-sdk/core/principal").Principal;
  joinCode:    string;
  createdAt:   bigint;
};

export type Assignment = {
  id:            string;
  associationId: string;
  title:         string;
  articleIds:    string[];
  casebook:      boolean;
  dueAt:         bigint;
  targetMembers: import("@icp-sdk/core/principal").Principal[];
  createdAt:     bigint;
};

export type Completion = {
  assignmentId: string;
  member:       import("@icp-sdk/core/principal").Principal;
  score:        bigint;
  completedAt:  bigint;
};

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Assoc = I.Record({
    id: I.Text, name: I.Text, sport: I.Text, coordinator: I.Principal, joinCode: I.Text, createdAt: I.Int,
  });
  const Assign = I.Record({
    id: I.Text, associationId: I.Text, title: I.Text, articleIds: I.Vec(I.Text), casebook: I.Bool,
    dueAt: I.Int, targetMembers: I.Vec(I.Principal), createdAt: I.Int,
  });
  const Comp = I.Record({ assignmentId: I.Text, member: I.Principal, score: I.Nat, completedAt: I.Int });
  const ResultAssoc  = I.Variant({ ok: Assoc, err: I.Text });
  const ResultAssign = I.Variant({ ok: Assign, err: I.Text });
  const ResultUnit   = I.Variant({ ok: I.Null, err: I.Text });
  const ResultMembers = I.Variant({ ok: I.Vec(I.Principal), err: I.Text });
  const ResultAssigns  = I.Variant({ ok: I.Vec(Assign), err: I.Text });
  const ResultComps    = I.Variant({ ok: I.Vec(Comp), err: I.Text });
  return I.Service({
    createAssociation:          I.Func([I.Text, I.Text], [ResultAssoc], []),
    joinAssociation:            I.Func([I.Text], [ResultAssoc], []),
    createAssignment:           I.Func([I.Text, I.Text, I.Vec(I.Text), I.Bool, I.Int, I.Vec(I.Principal)], [ResultAssign], []),
    recordCompletion:           I.Func([I.Text, I.Nat], [ResultUnit], []),
    getMyAssociations:          I.Func([], [I.Vec(Assoc)], ["query"]),
    getMyCoordinatedAssociations: I.Func([], [I.Vec(Assoc)], ["query"]),
    getAssociation:              I.Func([I.Text], [I.Opt(Assoc)], ["query"]),
    getAssociationMembers:       I.Func([I.Text], [ResultMembers], ["query"]),
    getAssociationAssignments:   I.Func([I.Text], [ResultAssigns], ["query"]),
    getMyAssignments:            I.Func([], [I.Vec(Assign)], ["query"]),
    getMyCompletions:            I.Func([], [I.Vec(Comp)], ["query"]),
    getAssignmentCompletions:    I.Func([I.Text], [ResultComps], ["query"]),
    metrics: I.Func([], [I.Record({ associationCount: I.Nat, assignmentCount: I.Nat })], ["query"]),
  });
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_ASSOCIATION !== "undefined" ? CANISTER_ID_ASSOCIATION : "";

function actor() {
  return createActor<{
    createAssociation:            (name: string, sport: string) => Promise<{ ok: AssociationRec } | { err: string }>;
    joinAssociation:              (joinCode: string) => Promise<{ ok: AssociationRec } | { err: string }>;
    createAssignment:             (associationId: string, title: string, articleIds: string[], casebook: boolean, dueAt: bigint, targetMembers: any[]) => Promise<{ ok: Assignment } | { err: string }>;
    recordCompletion:             (assignmentId: string, score: bigint) => Promise<{ ok: null } | { err: string }>;
    getMyAssociations:            () => Promise<AssociationRec[]>;
    getMyCoordinatedAssociations: () => Promise<AssociationRec[]>;
    getAssociation:                (id: string) => Promise<[] | [AssociationRec]>;
    getAssociationMembers:         (id: string) => Promise<{ ok: any[] } | { err: string }>;
    getAssociationAssignments:     (id: string) => Promise<{ ok: Assignment[] } | { err: string }>;
    getMyAssignments:              () => Promise<Assignment[]>;
    getMyCompletions:              () => Promise<Completion[]>;
    getAssignmentCompletions:      (assignmentId: string) => Promise<{ ok: Completion[] } | { err: string }>;
  }>(CANISTER_ID, idlFactory);
}

export const associationService = {
  async createAssociation(name: string, sport: string): Promise<AssociationRec> {
    if (!CANISTER_ID) throw new Error("Association canister not deployed");
    const res = await actor().createAssociation(name, sport);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async joinAssociation(joinCode: string): Promise<AssociationRec> {
    if (!CANISTER_ID) throw new Error("Association canister not deployed");
    const res = await actor().joinAssociation(joinCode);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async createAssignment(
    associationId: string, title: string, articleIds: string[], casebook: boolean, dueAt: number, targetMembers: any[],
  ): Promise<Assignment> {
    if (!CANISTER_ID) throw new Error("Association canister not deployed");
    const res = await actor().createAssignment(associationId, title, articleIds, casebook, BigInt(dueAt) * 1_000_000n, targetMembers);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async recordCompletion(assignmentId: string, score: number): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().recordCompletion(assignmentId, BigInt(Math.round(score))).catch(() => {});
  },

  async getMyAssociations(): Promise<AssociationRec[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyAssociations();
  },

  async getMyCoordinatedAssociations(): Promise<AssociationRec[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyCoordinatedAssociations();
  },

  async getAssociation(id: string): Promise<AssociationRec | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getAssociation(id);
    return res.length ? res[0] : null;
  },

  async getAssociationMembers(id: string): Promise<any[]> {
    if (!CANISTER_ID) return [];
    const res = await actor().getAssociationMembers(id);
    if ("err" in res) return [];
    return res.ok;
  },

  async getAssociationAssignments(id: string): Promise<Assignment[]> {
    if (!CANISTER_ID) return [];
    const res = await actor().getAssociationAssignments(id);
    if ("err" in res) return [];
    return res.ok;
  },

  async getMyAssignments(): Promise<Assignment[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyAssignments();
  },

  async getMyCompletions(): Promise<Completion[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyCompletions();
  },

  async getAssignmentCompletions(assignmentId: string): Promise<Completion[]> {
    if (!CANISTER_ID) return [];
    const res = await actor().getAssignmentCompletions(assignmentId);
    if ("err" in res) return [];
    return res.ok;
  },
};
