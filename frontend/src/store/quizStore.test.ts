import { describe, it, expect, beforeEach } from "vitest";
import { useQuizStore } from "./quizStore";
import { unrevealed, type QuestionView } from "../services/exam";

const view: QuestionView = {
  id: "q1", sportId: "s", articleId: "s:art1", citation: "", stem: "Stem?",
  choices: [{ id: "a", text: "A" }, { id: "b", text: "B" }],
  difficulty: { Beginner: null }, isCasebook: false, isPointOfEmphasis: false,
};

describe("graded quiz questions", () => {
  beforeEach(() => useQuizStore.getState().reset());

  it("arrive without their answer", () => {
    const q = unrevealed(view);
    expect(q.correctId).toBe("");
    expect(q.explanation).toBe("");
  });

  it("are filled in when the canister reveals them", () => {
    useQuizStore.getState().loadQuestions([unrevealed(view)], "ex1");
    useQuizStore.getState().revealQuestion("q1", "b", "Because.", "Art. 1, Sec. 2");
    const q = useQuizStore.getState().questions[0];
    expect(q.correctId).toBe("b");
    expect(q.explanation).toBe("Because.");
    expect(q.citation).toBe("Art. 1, Sec. 2");
  });
});
