import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE } from "../declarations/association";
import type { Requirement, SetRequirementError } from "../lib/transcript";
import { LicenseRequired, type LicenseClaimError, type LicenseView } from "../lib/license";
import type { Principal } from "@icp-sdk/core/principal";

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

export type TrainingRequirement = { hoursPerSeason: bigint; seasonStartMonth: bigint; updatedAt: bigint };

/** A refused license checkout, claim or seat move; map `reason` with licenseClaimErrorKey. */
export class LicenseFailed extends Error {
  constructor(public readonly reason: LicenseClaimError | Record<string, null>) {
    super(Object.keys(reason)[0]);
  }
}

/** A rejected setTrainingRequirement; map `reason` with requirementErrorKey. */
export class SetRequirementFailed extends Error {
  constructor(public readonly reason: SetRequirementError) {
    super(Object.keys(reason)[0]);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = canisterId("association");

function actor() {
  return createActor<_SERVICE>(CANISTER_ID, idlFactory);
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
    if ("err" in res) {
      if ("licenseRequired" in res.err) throw new LicenseRequired();
      throw new Error("notCoordinator" in res.err ? "Only the coordinator can assign modules" : "Association not found");
    }
    return res.ok;
  },

  /** Marks an assignment complete from the graded exam session it was taken in. */
  async recordGradedCompletion(assignmentId: string, sessionId: string): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().recordGradedCompletion(assignmentId, sessionId);
    if ("err" in res) throw new Error(res.err);
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

  /** Coordinator only. null clears the requirement. Throws SetRequirementFailed. */
  async setTrainingRequirement(associationId: string, req: Requirement | null): Promise<TrainingRequirement | null> {
    if (!CANISTER_ID) throw new Error("Association canister not deployed");
    const input: [] | [{ hoursPerSeason: bigint; seasonStartMonth: bigint }] =
      req ? [{ hoursPerSeason: BigInt(req.hoursPerSeason), seasonStartMonth: BigInt(req.seasonStartMonth) }] : [];
    const res = await actor().setTrainingRequirement(associationId, input);
    if ("err" in res) throw new SetRequirementFailed(res.err);
    return res.ok.length ? res.ok[0] : null;
  },

  async getTrainingRequirement(associationId: string): Promise<TrainingRequirement | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getTrainingRequirement(associationId);
    if ("err" in res) throw new Error("notAuthorized" in res.err ? "Not authorized" : "Association not found");
    return res.ok.length ? res.ok[0] : null;
  },

  // ─── Seat licenses (issue #78) ───

  /** The association's license and seats. Coordinator only; null when it can't be read. */
  async getLicense(associationId: string): Promise<LicenseView | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getLicense(associationId);
    return "err" in res ? null : res.ok;
  },

  /** Moves a seat (and its Pro) from one member to another. Throws LicenseFailed. */
  async moveSeat(associationId: string, from: Principal, to: Principal): Promise<LicenseView> {
    if (!CANISTER_ID) throw new Error("Association canister not deployed");
    const res = await actor().moveSeat(associationId, from, to);
    if ("err" in res) throw new LicenseFailed(res.err);
    return res.ok;
  },

  /** A Stripe Checkout URL for `seats` seats (10 or more). Website only. Throws LicenseFailed. */
  async startLicenseCheckout(associationId: string, seats: number): Promise<string> {
    if (!CANISTER_ID) throw new Error("Association canister not deployed");
    const res = await actor().startLicenseCheckout(associationId, BigInt(seats));
    if ("err" in res) throw new LicenseFailed(res.err);
    return res.ok;
  },

  /** Licenses the association from a finished checkout. Throws LicenseFailed. */
  async claimLicense(associationId: string, sessionId: string): Promise<LicenseView> {
    if (!CANISTER_ID) throw new Error("Association canister not deployed");
    const res = await actor().claimLicense(associationId, sessionId);
    if ("err" in res) throw new LicenseFailed(res.err);
    return res.ok;
  },

  /** Re-reads the Stripe subscription now (after a change in the customer portal). Throws LicenseFailed. */
  async refreshLicense(associationId: string): Promise<LicenseView> {
    if (!CANISTER_ID) throw new Error("Association canister not deployed");
    const res = await actor().refreshLicense(associationId);
    if ("err" in res) throw new LicenseFailed(res.err);
    return res.ok;
  },

  async leaveAssociation(associationId: string): Promise<void> {
    if (!CANISTER_ID) throw new Error("Association canister not deployed");
    const res = await actor().leaveAssociation(associationId);
    if ("err" in res) throw new Error(res.err);
  },

  async getAssignmentCompletions(assignmentId: string): Promise<Completion[]> {
    if (!CANISTER_ID) return [];
    const res = await actor().getAssignmentCompletions(assignmentId);
    if ("err" in res) return [];
    return res.ok;
  },
};
