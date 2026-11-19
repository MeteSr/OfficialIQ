import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../i18n";

const accuracy = vi.fn();
const getGoal = vi.fn();
const setGoal = vi.fn();

vi.mock("../services/question", () => ({ questionService: { getMyArticleAccuracy: (s: string) => accuracy(s) } }));
vi.mock("../services/exam", async (orig) => ({
  ...(await orig<typeof import("../services/exam")>()),
  examService: {
    listExamTemplates: async () => [{
      id: "tpl0", name: "State certification", sportId: "ncaa_basketball", questionCount: 50n, timeLimitSec: 3600n,
      casebookRatioPct: 20n, passThresholdPct: 75n, createdAt: 0n,
      articleWeights: [["ncaa_basketball:art1", 2n], ["ncaa_basketball:art2", 1n], ["ncaa_basketball:art3", 1n]],
    }],
  },
}));
vi.mock("../services/content", () => ({
  contentService: {
    listArticles: async () => [
      { id: "ncaa_basketball:art1", number: 1n, title: "Fouls" },
      { id: "ncaa_basketball:art2", number: 2n, title: "Timing" },
      { id: "ncaa_basketball:art3", number: 3n, title: "Free throws" },
    ],
  },
}));
vi.mock("../services/user", async (orig) => ({
  ...(await orig<typeof import("../services/user")>()),
  userService: { getMyCertGoal: () => getGoal(), setCertGoal: (g: unknown) => setGoal(g) },
}));

import ReadinessPage from "./ReadinessPage";
import { useAuthStore } from "../store/authStore";

const rows = (r: [string, number, number][]) => new Map(r.map(([id, correct, answered]) => [`ncaa_basketball:${id}`, { correct, answered }]));
const inDays = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const goalIn = (n: number) => ({ examDate: BigInt(inDays(n).getTime()) * 1_000_000n, templateId: ["tpl0"], updatedAt: 0n });

function renderPage() {
  render(<MemoryRouter initialEntries={["/readiness"]}><Routes><Route path="/readiness" element={<ReadinessPage />} /></Routes></MemoryRouter>);
}

describe("ReadinessPage", () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth("me", null);
    getGoal.mockResolvedValue(null);
    setGoal.mockReset();
  });
  afterEach(() => { cleanup(); accuracy.mockReset(); });

  it("gives the weighted estimate, labelled as an estimate, with a bar per section", async () => {
    // Estimates (correct + 1) / (answered + 2): 86, 82, 73; weighted 2:1:1 → 82.
    accuracy.mockResolvedValue({ proOnly: false, accuracy: rows([["art1", 18, 20], ["art2", 17, 20], ["art3", 15, 20]]) });
    renderPage();
    expect(await screen.findByText(/likely pass today: 82%/i)).toBeInTheDocument();
    expect(screen.getByText(/estimate from your own answers, not a prediction/i)).toBeInTheDocument();
    const fouls = screen.getByRole("link", { name: /Fouls/ });
    expect(within(fouls).getByText("86%")).toBeInTheDocument();
    expect(fouls).toHaveAttribute("href", "/quiz/ncaa_basketball:art1?adaptive=1");
    expect(screen.getAllByRole("progressbar")).toHaveLength(3);
  });

  it("says plainly when the estimate is below the pass mark", async () => {
    accuracy.mockResolvedValue({ proOnly: false, accuracy: rows([["art1", 10, 20], ["art2", 10, 20], ["art3", 10, 20]]) });
    renderPage();
    expect(await screen.findByText(/not there yet: 50%.*75%/i)).toBeInTheDocument();
  });

  it("says when there isn't enough practice yet instead of a verdict", async () => {
    accuracy.mockResolvedValue({ proOnly: false, accuracy: rows([["art3", 3, 4]]) });
    renderPage();
    expect(await screen.findByText(/not enough practice yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/likely pass today/i)).toBeNull();
  });

  it("asks for an exam date, then shows the day-by-day plan to it", async () => {
    accuracy.mockResolvedValue({ proOnly: false, accuracy: rows([["art1", 18, 20], ["art2", 8, 20], ["art3", 19, 20]]) });
    setGoal.mockResolvedValue(goalIn(5));
    renderPage();
    const input = await screen.findByLabelText(/exam date/i);
    const d = inDays(5);
    fireEvent.change(input, { target: { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(setGoal).toHaveBeenCalledWith(expect.objectContaining({ templateId: "tpl0" })));
    expect(await screen.findByText(/5 days to your exam/i)).toBeInTheDocument();
    const plan = screen.getByRole("list", { name: /study plan/i });
    const items = within(plan).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(within(items[0]).getByText(/Timing/)).toBeInTheDocument(); // the weakest section
    expect(within(items[4]).getByRole("link", { name: /practice exam/i })).toHaveAttribute("href", "/exam-sim");
  });

  it("offers Pro to a free official once the paywall is on", async () => {
    accuracy.mockResolvedValue({ proOnly: true, accuracy: new Map() });
    renderPage();
    expect(await screen.findByText(/part of OfficialIQ Pro/)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
