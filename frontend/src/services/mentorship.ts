import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE } from "../declarations/mentorship";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnswerSnapshot = {
  questionId: string;
  chosenId:   string;
  correctId:  string;
  isCorrect:  boolean;
  elapsedSec: bigint;
};

export type MentorLink = {
  id:              string;
  token:           string;
  owner:           import("@icp-sdk/core/principal").Principal;
  mentorPrincipal: [] | [import("@icp-sdk/core/principal").Principal];
  examId:          string;
  sportId:         string;
  score:           bigint;
  avgElapsedSec:   [] | [bigint];
  answers:         AnswerSnapshot[];
  revoked:         boolean;
  createdAt:       bigint;
  expiresAt:       bigint;
};

export type Annotation = {
  id:         string;
  linkId:     string;
  questionId: string;
  mentor:     import("@icp-sdk/core/principal").Principal;
  note:       string;
  seen:       boolean;
  createdAt:  bigint;
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = canisterId("mentorship");

function actor() {
  return createActor<_SERVICE>(CANISTER_ID, idlFactory);
}

export const mentorshipService = {
  async createMentorLink(
    examId: string, sportId: string, score: number, avgElapsedSec: number | null, answers: AnswerSnapshot[],
  ): Promise<MentorLink> {
    if (!CANISTER_ID) throw new Error("Mentorship canister not deployed");
    const res = await actor().createMentorLink(
      examId, sportId, BigInt(Math.round(score)),
      avgElapsedSec !== null ? [BigInt(Math.round(avgElapsedSec))] : [],
      answers,
    );
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async revokeMentorLink(id: string): Promise<void> {
    if (!CANISTER_ID) throw new Error("Mentorship canister not deployed");
    const res = await actor().revokeMentorLink(id);
    if ("err" in res) throw new Error(res.err);
  },

  async openMentorLink(token: string): Promise<MentorLink> {
    if (!CANISTER_ID) throw new Error("Mentorship canister not deployed");
    const res = await actor().openMentorLink(token);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async addAnnotation(linkId: string, questionId: string, note: string): Promise<Annotation> {
    if (!CANISTER_ID) throw new Error("Mentorship canister not deployed");
    const res = await actor().addAnnotation(linkId, questionId, note);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async markAnnotationSeen(id: string): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().markAnnotationSeen(id).catch(() => {});
  },

  async getMyMentorLinks(): Promise<MentorLink[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyMentorLinks();
  },

  async getMentorDashboard(): Promise<MentorLink[]> {
    if (!CANISTER_ID) return [];
    return actor().getMentorDashboard();
  },

  async getAnnotationsForLink(linkId: string): Promise<Annotation[]> {
    if (!CANISTER_ID) return [];
    const res = await actor().getAnnotationsForLink(linkId);
    if ("err" in res) return [];
    return res.ok;
  },

  async getMyAnnotations(): Promise<Annotation[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyAnnotations();
  },

  async getMyUnseenAnnotationCount(): Promise<number> {
    if (!CANISTER_ID) return 0;
    return Number(await actor().getMyUnseenAnnotationCount());
  },
};
