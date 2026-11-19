import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../i18n";

const answerQuestion = vi.fn();
const finishSession = vi.fn();
vi.mock("../services/exam", async (orig) => ({
  ...(await orig<typeof import("../services/exam")>()),
  examService: {
    answerQuestion: (...a: unknown[]) => answerQuestion(...a),
    finishSession: (...a: unknown[]) => finishSession(...a),
  },
}));

import GradedQuiz from "./GradedQuiz";

const q = (id: string) => ({
  id, sportId: "s", articleId: "s:art1", citation: `Rule ${id}`, stem: `Stem ${id}`,
  choices: [{ id: "a", text: "Alpha" }, { id: "b", text: "Bravo" }],
  difficulty: { Beginner: null }, isCasebook: false, isPointOfEmphasis: false,
});

function startWith(answered: string[], finished = false) {
  return () => Promise.resolve({
    session: {
      id: "ex1", questionIds: ["q1", "q2"], finishedAt: finished ? [1n] : [],
      answers: answered.map(questionId => ({ questionId, chosenId: "a", isCorrect: true, elapsedSec: 1n })),
    } as any,
    questions: [q("q1"), q("q2")],
  });
}

const finish = { session: { id: "ex1", score: [50n] }, feedback: [] } as any;

describe("GradedQuiz", () => {
  afterEach(cleanup);
  beforeEach(() => {
    answerQuestion.mockReset().mockImplementation(async (_s, questionId) => ({ questionId, isCorrect: false, correctId: "a", explanation: "Because A", citation: `Rule ${questionId}` }));
    finishSession.mockReset().mockResolvedValue(finish);
  });

  it("resumes at the first unanswered question", async () => {
    render(<GradedQuiz start={startWith(["q1"])} secPerQ={60} label="Game" onBack={() => {}} onFinished={() => {}} />);
    expect(await screen.findByText("Stem q2")).toBeTruthy();
  });

  it("reveals the graded answer, then finishes the session on the last question", async () => {
    const onFinished = vi.fn();
    render(<GradedQuiz start={startWith(["q1"])} secPerQ={60} label="Game" onBack={() => {}} onFinished={onFinished} />);
    fireEvent.click(await screen.findByText("Bravo"));
    expect(await screen.findByText(/Because A/)).toBeTruthy();
    expect(answerQuestion).toHaveBeenCalledWith("ex1", "q2", "b", expect.any(Number));
    fireEvent.click(screen.getByText("Finish"));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(finish, expect.any(Array)));
    expect(finishSession).toHaveBeenCalledWith("ex1");
  });

  it("goes straight to the result for a session that's already finished", async () => {
    const onFinished = vi.fn();
    render(<GradedQuiz start={startWith([], true)} secPerQ={60} label="Game" onBack={() => {}} onFinished={onFinished} />);
    await waitFor(() => expect(onFinished).toHaveBeenCalled());
    expect(answerQuestion).not.toHaveBeenCalled();
  });

  it("sends a timeout when the clock runs out", async () => {
    render(<GradedQuiz start={startWith([])} secPerQ={1} label="Game" onBack={() => {}} onFinished={() => {}} />);
    await screen.findByText("Stem q1");
    await waitFor(() => expect(answerQuestion).toHaveBeenCalledWith("ex1", "q1", "__timeout__", 1), { timeout: 3000 });
  });

  it("shows a load failure instead of a blank screen", async () => {
    render(<GradedQuiz start={() => Promise.reject(new Error("canister down"))} secPerQ={60} label="Game" onBack={() => {}} onFinished={() => {}} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/canister down/);
  });
});
