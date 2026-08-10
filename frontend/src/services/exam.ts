import { IDL } from "@icp-sdk/core/candid";
import { createActor } from "./actor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExamMode = { Solo: null } | { ShareLink: null } | { Timed: null };

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

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const Mode    = I.Variant({ Solo: I.Null, ShareLink: I.Null, Timed: I.Null });
  const Config  = I.Record({ sportId: I.Text, articleIds: I.Vec(I.Text), casebook: I.Bool, count: I.Nat, secPerQ: I.Nat, mode: Mode });
  const Answer  = I.Record({ questionId: I.Text, chosenId: I.Text, isCorrect: I.Bool, elapsedSec: I.Nat });
  const Session = I.Record({
    id: I.Text, owner: I.Principal, config: Config, questionIds: I.Vec(I.Text),
    answers: I.Vec(Answer), score: I.Opt(I.Nat), avgElapsedSec: I.Opt(I.Nat), shareToken: I.Opt(I.Text),
    startedAt: I.Int, finishedAt: I.Opt(I.Int),
  });
  const ResultS = I.Variant({ ok: Session, err: I.Text });
  return I.Service({
    createSession:  I.Func([Config, I.Vec(I.Text)], [ResultS],        []),
    submitExam:     I.Func([I.Text, I.Vec(Answer)],  [ResultS],        []),
    getMyExams:     I.Func([],                        [I.Vec(Session)], ["query"]),
    getByShareToken:I.Func([I.Text],                  [I.Opt(Session)], ["query"]),
    metrics:        I.Func([],                        [I.Record({ sessionCount: I.Nat })], ["query"]),
  });
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_EXAM !== "undefined" ? CANISTER_ID_EXAM : "";

function actor() {
  return createActor<{
    createSession:   (config: ExamConfig, qIds: string[]) => Promise<{ ok: ExamSession } | { err: string }>;
    submitExam:      (id: string, answers: AnswerRecord[]) => Promise<{ ok: ExamSession } | { err: string }>;
    getMyExams:      () => Promise<ExamSession[]>;
    getByShareToken: (token: string) => Promise<[] | [ExamSession]>;
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
};
