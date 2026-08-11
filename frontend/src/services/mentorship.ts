import { IDL } from "@icp-sdk/core/candid";
import { createActor } from "./actor";

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

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Answer = I.Record({
    questionId: I.Text, chosenId: I.Text, correctId: I.Text, isCorrect: I.Bool, elapsedSec: I.Nat,
  });
  const Link = I.Record({
    id: I.Text, token: I.Text, owner: I.Principal, mentorPrincipal: I.Opt(I.Principal),
    examId: I.Text, sportId: I.Text, score: I.Nat, avgElapsedSec: I.Opt(I.Nat),
    answers: I.Vec(Answer), revoked: I.Bool, createdAt: I.Int, expiresAt: I.Int,
  });
  const Note = I.Record({
    id: I.Text, linkId: I.Text, questionId: I.Text, mentor: I.Principal,
    note: I.Text, seen: I.Bool, createdAt: I.Int,
  });
  const ResultLink = I.Variant({ ok: Link, err: I.Text });
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  const ResultNote = I.Variant({ ok: Note, err: I.Text });
  const ResultNotes = I.Variant({ ok: I.Vec(Note), err: I.Text });
  return I.Service({
    createMentorLink:        I.Func([I.Text, I.Text, I.Nat, I.Opt(I.Nat), I.Vec(Answer)], [ResultLink], []),
    revokeMentorLink:        I.Func([I.Text], [ResultUnit], []),
    openMentorLink:          I.Func([I.Text], [ResultLink], []),
    addAnnotation:           I.Func([I.Text, I.Text, I.Text], [ResultNote], []),
    markAnnotationSeen:      I.Func([I.Text], [ResultUnit], []),
    getMyMentorLinks:        I.Func([], [I.Vec(Link)], ["query"]),
    getMentorDashboard:      I.Func([], [I.Vec(Link)], ["query"]),
    getAnnotationsForLink:   I.Func([I.Text], [ResultNotes], ["query"]),
    getMyAnnotations:        I.Func([], [I.Vec(Note)], ["query"]),
    getMyUnseenAnnotationCount: I.Func([], [I.Nat], ["query"]),
    metrics:                 I.Func([], [I.Record({ linkCount: I.Nat, annotationCount: I.Nat })], ["query"]),
  });
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_MENTORSHIP !== "undefined" ? CANISTER_ID_MENTORSHIP : "";

function actor() {
  return createActor<{
    createMentorLink:   (examId: string, sportId: string, score: bigint, avgElapsedSec: [] | [bigint], answers: AnswerSnapshot[]) => Promise<{ ok: MentorLink } | { err: string }>;
    revokeMentorLink:   (id: string) => Promise<{ ok: null } | { err: string }>;
    openMentorLink:     (token: string) => Promise<{ ok: MentorLink } | { err: string }>;
    addAnnotation:      (linkId: string, questionId: string, note: string) => Promise<{ ok: Annotation } | { err: string }>;
    markAnnotationSeen: (id: string) => Promise<{ ok: null } | { err: string }>;
    getMyMentorLinks:   () => Promise<MentorLink[]>;
    getMentorDashboard: () => Promise<MentorLink[]>;
    getAnnotationsForLink: (linkId: string) => Promise<{ ok: Annotation[] } | { err: string }>;
    getMyAnnotations:   () => Promise<Annotation[]>;
    getMyUnseenAnnotationCount: () => Promise<bigint>;
  }>(CANISTER_ID, idlFactory);
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
