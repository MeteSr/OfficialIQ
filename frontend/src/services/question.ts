import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE } from "../declarations/question";
import { cacheQuestions, getCachedQuestion, getCachedQuestionsFor } from "../lib/offlineDb";

export const REPORT_REASONS = ["WrongAnswer", "Unclear", "Outdated", "Typo", "Other"] as const;
export type ReportReason = typeof REPORT_REASONS[number];
export type QuestionReport = {
  id: string; questionId: string; reporter: import("@icp-sdk/core/principal").Principal; reason: ReportReason;
  note: string; createdAt: bigint; resolved: boolean; resolution: string; resolvedAt: [] | [bigint];
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type Difficulty =
  | { Beginner: null }
  | { Intermediate: null }
  | { Advanced: null }
  | { Expert: null };

export type Choice = { id: string; text: string };

export type Question = {
  id:                string;
  sportId:           string;
  articleId:         string;
  citation:          string;
  stem:              string;
  choices:           Choice[];
  correctId:         string;
  explanation:       string;
  difficulty:        Difficulty;
  isCasebook:        boolean;
  isPointOfEmphasis: boolean;
  createdAt:         bigint;
};

export type QuizFilter = {
  sportId:    string;
  articleIds: string[];
  casebook:   boolean;
  difficulty: [] | [Difficulty];
  count:      bigint;
};

export type QuestionInput = {
  sportId:           string;
  articleId:         string;
  citation:          string;
  stem:              string;
  choices:           Choice[];
  correctId:         string;
  explanation:       string;
  difficulty:        Difficulty;
  isCasebook:        boolean;
  isPointOfEmphasis: boolean;
};

export type UserQuestionHistory = {
  questionId:    string;
  timesAnswered: bigint;
  timesCorrect:  bigint;
  lastAnswered:  bigint;
  nextDue:       bigint;
  easiness:      number;
  repetitions:   bigint;
  intervalDays:  bigint;
};

// ─── Mock data ────────────────────────────────────────────────────────────────

export const MOCK_QUESTIONS: Question[] = [
  {
    id: "q0", sportId: "ncaa_basketball", articleId: "ncaa_basketball:art4",
    citation: "Art. 4-23, pg. 42",
    stem: "A player drives to the basket and is fouled by a defender who has established legal guarding position. The offensive player also charges. This is best described as:",
    choices: [
      { id: "a", text: "Simultaneous foul — both disqualified" },
      { id: "b", text: "Blocking foul — defender penalized" },
      { id: "c", text: "Charge — attacker responsible" },
      { id: "d", text: "Player control foul on offense" },
    ],
    correctId: "b", explanation: "A defender who has established legal guarding position may not move into the path of the dribbler.",
    difficulty: { Intermediate: null }, isCasebook: true, isPointOfEmphasis: false, createdAt: 0n,
  },
  {
    id: "q1", sportId: "ncaa_basketball", articleId: "ncaa_basketball:art4",
    citation: "Art. 4-14, pg. 38",
    stem: "A technical foul for unsporting conduct is charged to:",
    choices: [
      { id: "a", text: "The head coach only" },
      { id: "b", text: "The bench" },
      { id: "c", text: "The individual who committed the act" },
      { id: "d", text: "The team as a whole" },
    ],
    correctId: "c", explanation: "Technical fouls for unsporting conduct are charged to the individual responsible.",
    difficulty: { Beginner: null }, isCasebook: false, isPointOfEmphasis: false, createdAt: 0n,
  },
  {
    id: "q2", sportId: "ncaa_basketball", articleId: "ncaa_basketball:art5",
    citation: "Art. 5-4, pg. 55",
    stem: "A player dribbles and their pivot foot leaves the floor before the ball is released. This is:",
    choices: [
      { id: "a", text: "A travel violation" },
      { id: "b", text: "Legal — pivot foot may lift during dribble" },
      { id: "c", text: "An illegal dribble" },
      { id: "d", text: "A carrying violation" },
    ],
    correctId: "a", explanation: "The pivot foot must not lift before the dribble begins.",
    difficulty: { Beginner: null }, isCasebook: false, isPointOfEmphasis: false, createdAt: 0n,
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = canisterId("question");

function actor() {
  return createActor<_SERVICE>(CANISTER_ID, idlFactory);
}

export const questionService = {
  async sampleQuiz(filter: QuizFilter): Promise<Question[]> {
    if (!CANISTER_ID) {
      let pool = MOCK_QUESTIONS.filter(q =>
        q.sportId === filter.sportId &&
        (filter.articleIds.length === 0 || filter.articleIds.includes(q.articleId)) &&
        q.isCasebook === filter.casebook,
      );
      return pool.slice(0, Number(filter.count));
    }
    try {
      const qs = await actor().sampleQuiz(filter);
      cacheQuestions(qs).catch(() => {});
      return qs;
    } catch (e) {
      const cached = await getCachedQuestionsFor(filter.articleIds, filter.casebook, Number(filter.count));
      if (cached.length > 0) return cached;
      throw e;
    }
  },

  /** A sport's whole question bank, fetched a page at a time (for the offline cache). */
  async listAllForSync(sportId: string, pageSize = 500): Promise<Question[]> {
    if (!CANISTER_ID) return MOCK_QUESTIONS.filter(q => q.sportId === sportId);
    const all: Question[] = [];
    let after: [] | [string] = [];
    for (;;) {
      const page = await actor().listForSync(sportId, after, BigInt(pageSize));
      all.push(...page.questions);
      if (page.next.length === 0) return all;
      after = page.next;
    }
  },

  async getQuestion(id: string): Promise<Question | null> {
    if (!CANISTER_ID) return MOCK_QUESTIONS.find(q => q.id === id) ?? null;
    try {
      const res = await actor().getQuestion(id);
      return res.length ? res[0] : null;
    } catch (e) {
      const cached = await getCachedQuestion(id);
      if (cached) return cached;
      throw e;
    }
  },

  async getAdaptiveQuiz(filter: QuizFilter): Promise<Question[]> {
    if (!CANISTER_ID) return questionService.sampleQuiz(filter);
    try {
      const qs = await actor().getAdaptiveQuiz(filter);
      cacheQuestions(qs).catch(() => {});
      return qs;
    } catch (e) {
      const cached = await getCachedQuestionsFor(filter.articleIds, filter.casebook, Number(filter.count));
      if (cached.length > 0) return cached;
      throw e;
    }
  },

  async getDueCount(sportId: string, articleIds: string[], casebook: boolean): Promise<number> {
    if (!CANISTER_ID) return 0;
    try {
      return Number(await actor().getDueCount(sportId, articleIds, casebook));
    } catch {
      return 0;
    }
  },

  async getMyHistoryBatch(questionIds: string[]): Promise<(UserQuestionHistory | null)[]> {
    if (!CANISTER_ID || questionIds.length === 0) return questionIds.map(() => null);
    try {
      const res = await actor().getMyHistoryBatch(questionIds);
      return res.map(r => (r.length ? r[0] : null));
    } catch {
      return questionIds.map(() => null);
    }
  },

  async recordAnswer(questionId: string, isCorrect: boolean): Promise<void> {
    if (!CANISTER_ID) return;
    await actor().recordAnswer(questionId, isCorrect);
  },

  async addQuestion(input: QuestionInput): Promise<Question> {
    if (!CANISTER_ID) throw new Error("Question canister not deployed");
    const res = await actor().addQuestion(input);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async getMostMissedQuestions(sportId: string, limit: number): Promise<{ questionId: string; wrongCount: number; totalCount: number }[]> {
    if (!CANISTER_ID) return [];
    const rows = await actor().getMostMissedQuestions(sportId, BigInt(limit));
    return rows.map(([questionId, wrongCount, totalCount]) => ({ questionId, wrongCount: Number(wrongCount), totalCount: Number(totalCount) }));
  },

  /** How often every official got each question right, keyed by question id. Missing ids have no answers yet. */
  async getAnswerRates(questionIds: string[]): Promise<Map<string, { wrongCount: number; totalCount: number }>> {
    const out = new Map<string, { wrongCount: number; totalCount: number }>();
    if (!CANISTER_ID || questionIds.length === 0) return out;
    for (let i = 0; i < questionIds.length; i += 100) {
      const rows = await actor().getAnswerRates(questionIds.slice(i, i + 100));
      for (const [id, wrong, total] of rows) out.set(id, { wrongCount: Number(wrong), totalCount: Number(total) });
    }
    return out;
  },
  /** Flags a question as wrong or unclear for an admin to review. */
  async reportQuestion(questionId: string, reason: ReportReason, note: string): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().reportQuestion(questionId, { [reason]: null } as never, note);
    if ("err" in res) throw new Error(res.err);
  },

  /** Of these questions, the ones the caller has an open report on. */
  async myOpenReports(questionIds: string[]): Promise<string[]> {
    if (!CANISTER_ID || questionIds.length === 0) return [];
    return actor().myOpenReports(questionIds);
  },

  /** Admin only. */
  async listQuestionReports(includeResolved = false): Promise<QuestionReport[]> {
    if (!CANISTER_ID) return [];
    const res = await actor().listQuestionReports(includeResolved);
    if ("err" in res) throw new Error(res.err);
    return res.ok.map(r => ({ ...r, reason: Object.keys(r.reason)[0] as ReportReason }));
  },

  /** Admin only. */
  async resolveQuestionReport(id: string, resolution: string): Promise<void> {
    if (!CANISTER_ID) return;
    const res = await actor().resolveQuestionReport(id, resolution);
    if ("err" in res) throw new Error(res.err);
  },

  async isAdmin(): Promise<boolean> {
    if (!CANISTER_ID) return false;
    return actor().isAdminCaller();
  },
};
