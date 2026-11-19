import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE } from "../declarations/exam";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExamMode = { Solo: null } | { ShareLink: null } | { Timed: null } | { Certification: null };

export type ExamTemplate = {
  id:               string;
  name:             string;
  sportId:          string;
  questionCount:    bigint;
  timeLimitSec:     bigint;
  casebookRatioPct: bigint;
  passThresholdPct: bigint;
  articleWeights:   [string, bigint][];
  createdAt:        bigint;
};

export type ExamConfig = {
  sportId:    string;
  articleIds: string[];
  casebook:   boolean;
  count:      bigint;
  secPerQ:    bigint;
  mode:       ExamMode;
};

export type AnswerRecord = {
  questionId: string;
  chosenId:   string;
  isCorrect:  boolean;
  elapsedSec: bigint;
};

export type ExamSession = {
  id:            string;
  owner:         import("@icp-sdk/core/principal").Principal;
  config:        ExamConfig;
  questionIds:   string[];
  answers:       AnswerRecord[];
  score:         [] | [bigint];
  avgElapsedSec: [] | [bigint];
  shareToken:    [] | [string];
  startedAt:     bigint;
  finishedAt:    [] | [bigint];
};

// Graded sessions: the canister picks/holds the questions and their answers;
// the app only ever sees QuestionView (no correctId/explanation) until a
// question is answered.
export type QuestionView = {
  id: string; sportId: string; articleId: string; citation: string; stem: string;
  choices: { id: string; text: string }[];
  difficulty: import("./question").Difficulty;
  isCasebook: boolean; isPointOfEmphasis: boolean;
};
export type Pick = {
  articleIds: string[]; casebook: boolean; count: bigint;
  difficulty: [] | [import("./question").Difficulty]; adaptive: boolean;
  /** Only questions with this tag, e.g. a season's rule changes (#68). */
  tag: [] | [string];
};
export type QuestionSource = { Picks: Pick[] } | { Ids: string[] } | { ShareToken: string };
export type AnswerFeedback = { questionId: string; isCorrect: boolean; correctId: string; explanation: string; citation: string };
export type TrainingSession = {
  id: string; mode: ExamMode; sportId: string; questionCount: bigint; answered: bigint; correct: bigint;
  score: bigint; creditedSec: bigint; startedAt: bigint; finishedAt: bigint;
};
export type GradedStart = { session: ExamSession; questions: QuestionView[] };
export type GradedFinish = { session: ExamSession; feedback: AnswerFeedback[] };

/** A QuestionView as a Question whose answer isn't known yet (filled in on reveal). */
export function unrevealed(v: QuestionView): import("./question").Question {
  return { ...v, correctId: "", explanation: "", createdAt: 0n };
}

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = canisterId("exam");

function actor() {
  return createActor<_SERVICE>(CANISTER_ID, idlFactory);
}

export const examService = {
  async createSession(config: ExamConfig, questionIds: string[]): Promise<ExamSession> {
    if (!CANISTER_ID) {
      return {
        id: "ex_mock_" + Date.now(), owner: { toString: () => "2vxsx-fae" } as any,
        config, questionIds, answers: [], score: [], avgElapsedSec: [], shareToken: [],
        startedAt: BigInt(Date.now()) * 1_000_000n, finishedAt: [],
      };
    }
    const res = await actor().createSession(config, questionIds);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async submitExam(id: string, answers: AnswerRecord[]): Promise<ExamSession> {
    if (!CANISTER_ID) {
      const correct = answers.filter(a => a.isCorrect).length;
      const pct = answers.length ? BigInt(Math.round((correct / answers.length) * 100)) : 0n;
      const avgElapsed = answers.length
        ? [answers.reduce((sum, a) => sum + a.elapsedSec, 0n) / BigInt(answers.length)] as [bigint]
        : [] as [] | [bigint];
      return {
        id, owner: { toString: () => "2vxsx-fae" } as any,
        config: { sportId: "ncaa_basketball", articleIds: [], casebook: true, count: BigInt(answers.length), secPerQ: 45n, mode: { Solo: null } },
        questionIds: answers.map(a => a.questionId), answers, score: [pct], avgElapsedSec: avgElapsed,
        shareToken: [], startedAt: 0n, finishedAt: [BigInt(Date.now()) * 1_000_000n],
      };
    }
    const res = await actor().submitExam(id, answers);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async getMyExams(): Promise<ExamSession[]> {
    if (!CANISTER_ID) return [];
    // Tier-aware (issue #71): the last 30 days for a free official once the
    // paywall is on, everything kept otherwise.
    return actor().getMyExamHistory();
  },

  async getExamsFor(p: any): Promise<ExamSession[]> {
    if (!CANISTER_ID) return [];
    return actor().getExamsFor(p);
  },

  /** Exam history of an association member, for its coordinator. */
  async getMemberExams(p: any): Promise<ExamSession[]> {
    if (!CANISTER_ID) return [];
    return actor().getMemberExams(p);
  },

  /** The caller's finished graded sessions with the training time each is credited. */
  async getMyTraining(): Promise<TrainingSession[]> {
    if (!CANISTER_ID) return [];
    return actor().getMyTraining();
  },

  /** A member's training sessions — coordinator of one of their associations only. */
  async getMemberTraining(p: any): Promise<TrainingSession[]> {
    if (!CANISTER_ID) return [];
    const res = await actor().getMemberTraining(p);
    if ("err" in res) throw new Error("Not authorized");
    return res.ok;
  },

  /** True when graded (ranked) sessions are available — needs the deployed canister. */
  gradingAvailable(): boolean {
    return !!CANISTER_ID;
  },

  async startGradedSession(config: ExamConfig, source: QuestionSource): Promise<GradedStart> {
    const res = await actor().startGradedSession(config, source);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async createShareLink(config: ExamConfig, picks: Pick[]): Promise<string> {
    const res = await actor().createShareLink(config, picks);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async answerQuestion(sessionId: string, questionId: string, chosenId: string, elapsedSec: number): Promise<AnswerFeedback> {
    const res = await actor().answerQuestion(sessionId, questionId, chosenId, BigInt(Math.max(0, Math.round(elapsedSec))));
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async finishSession(sessionId: string): Promise<GradedFinish> {
    const res = await actor().finishSession(sessionId);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async submitGradedAnswers(sessionId: string, answers: { questionId: string; chosenId: string; elapsedSec: number }[]): Promise<GradedFinish> {
    const res = await actor().submitGradedAnswers(sessionId, answers.map(a => [a.questionId, a.chosenId, BigInt(Math.max(0, Math.round(a.elapsedSec)))] as [string, string, bigint]));
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async getByShareToken(token: string): Promise<ExamSession | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getByShareToken(token);
    return res.length ? res[0] : null;
  },

  async listExamTemplates(sportId: string): Promise<ExamTemplate[]> {
    if (!CANISTER_ID) return [];
    return actor().listExamTemplates(sportId);
  },

  async getExamTemplate(id: string): Promise<ExamTemplate | null> {
    if (!CANISTER_ID) return null;
    const res = await actor().getExamTemplate(id);
    return res.length ? res[0] : null;
  },
};

// Fallback used when no admin-configured template exists yet (e.g. before
// the first `scripts/seed-content.mjs` run) — mirrors the standard NCAA
// certification format from issue #16's acceptance criteria.
export const DEFAULT_CERT_TEMPLATE: Omit<ExamTemplate, "id" | "createdAt"> = {
  name:             "NCAA Men's Basketball Certification Exam",
  sportId:          "ncaa_basketball",
  questionCount:    100n,
  timeLimitSec:     5400n, // 90 minutes
  casebookRatioPct: 40n,
  passThresholdPct: 75n,
  articleWeights: Array.from({ length: 10 }, (_, i) => [`ncaa_basketball:art${i + 1}`, 1n] as [string, bigint]),
};
