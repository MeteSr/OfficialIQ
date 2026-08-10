import { IDL } from "@dfinity/candid";
import { createActor } from "./actor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Difficulty =
  | { Beginner: null }
  | { Intermediate: null }
  | { Advanced: null }
  | { Expert: null };

export type Choice = { id: string; text: string };

export type Question = {
  id:          string;
  sportId:     string;
  articleId:   string;
  citation:    string;
  stem:        string;
  choices:     Choice[];
  correctId:   string;
  explanation: string;
  difficulty:  Difficulty;
  isCasebook:  boolean;
  createdAt:   bigint;
};

export type QuizFilter = {
  sportId:    string;
  articleIds: string[];
  casebook:   boolean;
  difficulty: [] | [Difficulty];
  count:      bigint;
};

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const Diff   = I.Variant({ Beginner: I.Null, Intermediate: I.Null, Advanced: I.Null, Expert: I.Null });
  const Choice = I.Record({ id: I.Text, text: I.Text });
  const Q      = I.Record({
    id: I.Text, sportId: I.Text, articleId: I.Text, citation: I.Text,
    stem: I.Text, choices: I.Vec(Choice), correctId: I.Text,
    explanation: I.Text, difficulty: Diff, isCasebook: I.Bool, createdAt: I.Int,
  });
  const Filter = I.Record({
    sportId: I.Text, articleIds: I.Vec(I.Text),
    casebook: I.Bool, difficulty: I.Opt(Diff), count: I.Nat,
  });
  return I.Service({
    getQuestion: I.Func([I.Text], [I.Opt(Q)],  ["query"]),
    sampleQuiz:  I.Func([Filter], [I.Vec(Q)],  ["query"]),
    metrics:     I.Func([],       [I.Record({ questionCount: I.Nat })], ["query"]),
  });
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
    difficulty: { Intermediate: null }, isCasebook: true, createdAt: 0n,
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
    difficulty: { Beginner: null }, isCasebook: false, createdAt: 0n,
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
    difficulty: { Beginner: null }, isCasebook: false, createdAt: 0n,
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_QUESTION !== "undefined" ? CANISTER_ID_QUESTION : "";

function actor() {
  return createActor<{
    sampleQuiz:  (f: QuizFilter) => Promise<Question[]>;
    getQuestion: (id: string) => Promise<[] | [Question]>;
  }>(CANISTER_ID, idlFactory);
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
    return actor().sampleQuiz(filter);
  },

  async getQuestion(id: string): Promise<Question | null> {
    if (!CANISTER_ID) return MOCK_QUESTIONS.find(q => q.id === id) ?? null;
    const res = await actor().getQuestion(id);
    return res.length ? res[0] : null;
  },
};
