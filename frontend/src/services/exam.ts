import { IDL } from "@icp-sdk/core/candid";
import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";

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
};
export type QuestionSource = { Picks: Pick[] } | { Ids: string[] } | { ShareToken: string };
export type AnswerFeedback = { questionId: string; isCorrect: boolean; correctId: string; explanation: string; citation: string };
export type GradedStart = { session: ExamSession; questions: QuestionView[] };
export type GradedFinish = { session: ExamSession; feedback: AnswerFeedback[] };

/** A QuestionView as a Question whose answer isn't known yet (filled in on reveal). */
export function unrevealed(v: QuestionView): import("./question").Question {
  return { ...v, correctId: "", explanation: "", createdAt: 0n };
}

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Mode    = I.Variant({ Solo: I.Null, ShareLink: I.Null, Timed: I.Null, Certification: I.Null });
  const Config  = I.Record({ sportId: I.Text, articleIds: I.Vec(I.Text), casebook: I.Bool, count: I.Nat, secPerQ: I.Nat, mode: Mode });
  const Answer  = I.Record({ questionId: I.Text, chosenId: I.Text, isCorrect: I.Bool, elapsedSec: I.Nat });
  const Session = I.Record({
    id: I.Text, owner: I.Principal, config: Config, questionIds: I.Vec(I.Text),
    answers: I.Vec(Answer), score: I.Opt(I.Nat), avgElapsedSec: I.Opt(I.Nat), shareToken: I.Opt(I.Text),
    startedAt: I.Int, finishedAt: I.Opt(I.Int),
  });
  const Template = I.Record({
    id: I.Text, name: I.Text, sportId: I.Text, questionCount: I.Nat, timeLimitSec: I.Nat,
    casebookRatioPct: I.Nat, passThresholdPct: I.Nat,
    articleWeights: I.Vec(I.Tuple(I.Text, I.Nat)), createdAt: I.Int,
  });
  const ResultS = I.Variant({ ok: Session, err: I.Text });
  const Difficulty = I.Variant({ Beginner: I.Null, Intermediate: I.Null, Advanced: I.Null, Expert: I.Null });
  const Choice = I.Record({ id: I.Text, text: I.Text });
  const QView = I.Record({
    id: I.Text, sportId: I.Text, articleId: I.Text, citation: I.Text, stem: I.Text,
    choices: I.Vec(Choice), difficulty: Difficulty, isCasebook: I.Bool, isPointOfEmphasis: I.Bool,
  });
  const Pick = I.Record({ articleIds: I.Vec(I.Text), casebook: I.Bool, count: I.Nat, difficulty: I.Opt(Difficulty), adaptive: I.Bool });
  const Source = I.Variant({ Picks: I.Vec(Pick), Ids: I.Vec(I.Text), ShareToken: I.Text });
  const Feedback = I.Record({ questionId: I.Text, isCorrect: I.Bool, correctId: I.Text, explanation: I.Text, citation: I.Text });
  const ResultStart = I.Variant({ ok: I.Record({ session: Session, questions: I.Vec(QView) }), err: I.Text });
  const ResultFeedback = I.Variant({ ok: Feedback, err: I.Text });
  const ResultFinish = I.Variant({ ok: I.Record({ session: Session, feedback: I.Vec(Feedback) }), err: I.Text });
  const ResultText = I.Variant({ ok: I.Text, err: I.Text });
  return I.Service({
    createSession:      I.Func([Config, I.Vec(I.Text)], [ResultS],        []),
    submitExam:         I.Func([I.Text, I.Vec(Answer)],  [ResultS],        []),
    getMyExams:         I.Func([],                        [I.Vec(Session)], ["query"]),
    getExamsFor:        I.Func([I.Principal],              [I.Vec(Session)], ["query"]),
    getMemberExams:     I.Func([I.Principal],              [I.Vec(Session)], ["composite_query"]),
    startGradedSession: I.Func([Config, Source],          [ResultStart],    []),
    createShareLink:    I.Func([Config, I.Vec(Pick)],      [ResultText],     []),
    answerQuestion:     I.Func([I.Text, I.Text, I.Text, I.Nat], [ResultFeedback], []),
    finishSession:      I.Func([I.Text],                  [ResultFinish],   []),
    submitGradedAnswers: I.Func([I.Text, I.Vec(I.Tuple(I.Text, I.Text, I.Nat))], [ResultFinish], []),
    getByShareToken:    I.Func([I.Text],                  [I.Opt(Session)], ["query"]),
    listExamTemplates:  I.Func([I.Text],                  [I.Vec(Template)], ["query"]),
    getExamTemplate:    I.Func([I.Text],                  [I.Opt(Template)], ["query"]),
    metrics:            I.Func([],                        [I.Record({ sessionCount: I.Nat })], ["query"]),
  });
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = canisterId("exam");

function actor() {
  return createActor<{
    createSession:     (config: ExamConfig, qIds: string[]) => Promise<{ ok: ExamSession } | { err: string }>;
    submitExam:        (id: string, answers: AnswerRecord[]) => Promise<{ ok: ExamSession } | { err: string }>;
    getMyExams:        () => Promise<ExamSession[]>;
    getExamsFor:       (p: any) => Promise<ExamSession[]>;
    getMemberExams:    (p: any) => Promise<ExamSession[]>;
    startGradedSession: (config: ExamConfig, source: QuestionSource) => Promise<{ ok: GradedStart } | { err: string }>;
    createShareLink:   (config: ExamConfig, picks: Pick[]) => Promise<{ ok: string } | { err: string }>;
    answerQuestion:    (sessionId: string, questionId: string, chosenId: string, elapsedSec: bigint) => Promise<{ ok: AnswerFeedback } | { err: string }>;
    finishSession:     (sessionId: string) => Promise<{ ok: GradedFinish } | { err: string }>;
    submitGradedAnswers: (sessionId: string, answers: [string, string, bigint][]) => Promise<{ ok: GradedFinish } | { err: string }>;
    getByShareToken:   (token: string) => Promise<[] | [ExamSession]>;
    listExamTemplates: (sportId: string) => Promise<ExamTemplate[]>;
    getExamTemplate:   (id: string) => Promise<[] | [ExamTemplate]>;
  }>(CANISTER_ID, idlFactory);
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
    return actor().getMyExams();
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
