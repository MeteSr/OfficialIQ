import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../i18n";

const getCrew = vi.fn();
const getQuestion = vi.fn();
vi.mock("../services/challenge", () => ({ challengeService: { getCrew: (...a: unknown[]) => getCrew(...a) } }));
vi.mock("../services/question", () => ({ questionService: { getQuestion: (...a: unknown[]) => getQuestion(...a) } }));
vi.mock("../services/user", () => ({
  userService: { getPublicProfile: async (p: { toString(): string }) => ({ displayName: p.toString() === "bo" ? "Bo Ref" : "Ann Ref" }) },
}));
vi.mock("../services/exam", () => ({ examService: {} }));

import CrewPage from "./CrewPage";
import { useAuthStore } from "../store/authStore";

const p = (s: string) => ({ toString: () => s, toText: () => s }) as any;
const HOUR_MS = 3_600_000;

function crew(results: { who: string; missed: string[] }[]) {
  return {
    id: "crew0", code: "ABCD234567", creator: p("me"), gameLabel: "Central vs North",
    gameDate: BigInt(Date.now() + 2 * HOUR_MS) * 1_000_000n, sportId: "s", levelId: "varsity",
    questionIds: ["q1", "q2"], members: [p("me"), p("bo")],
    results: results.map(r => ({ principal: p(r.who), score: 50n, missed: r.missed, finishedAt: 0n })),
    createdAt: 0n, expiresAt: BigInt(Date.now() + 8 * HOUR_MS) * 1_000_000n,
  };
}

function renderCrew() {
  return render(
    <MemoryRouter initialEntries={["/crew/crew0"]}>
      <Routes><Route path="/crew/:id" element={<CrewPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe("CrewPage", () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth("me", null);
    getQuestion.mockReset().mockImplementation(async (id: string) => ({ id, citation: `Rule ${id}`, stem: `Stem ${id}`, explanation: `Why ${id}` }));
  });
  afterEach(cleanup);

  it("hides the crew's misses until you've played, so they can't spoil the quiz", async () => {
    getCrew.mockResolvedValue(crew([{ who: "bo", missed: ["q2"] }]));
    renderCrew();
    expect(await screen.findByText(/Take the crew quiz \(2 questions\)/)).toBeTruthy();
    expect(screen.getByText(/Finish the quiz to see/)).toBeTruthy();
    expect(screen.queryByText("Stem q2")).toBeNull();
    expect(getQuestion).not.toHaveBeenCalled();
  });

  it("shows who missed each question once you've played, most missed first", async () => {
    getCrew.mockResolvedValue(crew([{ who: "me", missed: ["q2"] }, { who: "bo", missed: ["q2"] }]));
    renderCrew();
    expect(await screen.findByText("Stem q2")).toBeTruthy();
    expect(screen.getByText("Missed by 2 of 2")).toBeTruthy();
    expect(screen.getByText("Missed by 0 of 2")).toBeTruthy();
    expect(await screen.findByText("You, Bo Ref")).toBeTruthy();
    expect(screen.queryByText(/Take the crew quiz/)).toBeNull();
  });

  it("says so when the crew doesn't exist or you're not in it", async () => {
    getCrew.mockResolvedValue(null);
    renderCrew();
    expect(await screen.findByText(/doesn't exist, has closed, or you're not in it/)).toBeTruthy();
  });
});
