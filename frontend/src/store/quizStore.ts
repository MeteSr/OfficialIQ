import { create } from "zustand";
import type { Question } from "../services/question";
import type { AnswerRecord } from "../services/exam";

type QuizState = {
  questions:   Question[];
  sessionId:   string | null;
  answers:     AnswerRecord[];
  currentIdx:  number;
  isComplete:  boolean;

  loadQuestions: (qs: Question[], sessionId: string | null) => void;
  recordAnswer:  (answer: AnswerRecord) => void;
  advance:       () => void;
  reset:         () => void;
};

export const useQuizStore = create<QuizState>((set, get) => ({
  questions:  [],
  sessionId:  null,
  answers:    [],
  currentIdx: 0,
  isComplete: false,

  loadQuestions: (questions, sessionId) =>
    set({ questions, sessionId, answers: [], currentIdx: 0, isComplete: false }),

  recordAnswer: (answer) =>
    set((s) => ({ answers: [...s.answers, answer] })),

  advance: () =>
    set((s) => {
      const next = s.currentIdx + 1;
      return next >= s.questions.length
        ? { isComplete: true, currentIdx: next }
        : { currentIdx: next };
    }),

  reset: () =>
    set({ questions: [], sessionId: null, answers: [], currentIdx: 0, isComplete: false }),
}));

// Selectors
export const selectCurrentQuestion = (s: QuizState) => s.questions[s.currentIdx] ?? null;
export const selectScore = (s: QuizState) =>
  s.answers.length === 0 ? 0
    : Math.round((s.answers.filter(a => a.isCorrect).length / s.answers.length) * 100);
