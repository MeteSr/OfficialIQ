import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../i18n";

const calls: { current: unknown[] } = { current: [] };
const addCallLog = vi.fn();
const setCallMatch = vi.fn();
const suggest = vi.fn();

const GAME = { id: "g1", opponent: "Central vs North", gameDate: BigInt(Date.now() - 3_600_000) * 1_000_000n, sportId: "s", levelId: "varsity", notes: "", createdAt: 0n };

vi.mock("../services/user", async (orig) => ({
  ...(await orig<typeof import("../services/user")>()),
  userService: {
    getMyRecentGames: async () => [GAME],
    getMyCallLogs: async () => calls.current,
    addCallLog: (g: string, n: string) => addCallLog(g, n),
    setCallMatch: (id: string, m: unknown) => setCallMatch(id, m),
    markCallReviewed: vi.fn(),
    deleteCallLog: vi.fn(),
  },
}));
vi.mock("../services/content", () => ({
  contentService: {
    listArticles: async () => [{ id: "s:art10", number: 10n, title: "Fouls" }, { id: "s:art4", number: 4n, title: "Definitions" }],
    listPlaysFor: async () => [{ id: "p1", articleId: "s:art10", citation: "10.6.1 Sit. A", scenario: "Guarding position before the shooter leaves the floor" }],
  },
}));
vi.mock("../services/aiProxy", () => ({
  aiProxyService: { suggestRuleForCall: (n: string, c: string) => suggest(n, c), getRateLimitStatus: async () => ({ used: 0, limitPerDay: 8, resetAt: 0, free: false }) },
}));

import CallLogPage from "./CallLogPage";
import { useAuthStore } from "../store/authStore";

const entry = (over: Record<string, unknown> = {}) => ({
  id: "call0", gameId: "g1", note: "Block/charge at the top of the key", match: [], status: { open: null }, createdAt: 0n, updatedAt: 0n, ...over,
});

function renderPage() {
  render(<MemoryRouter initialEntries={["/calls/g1"]}><Routes><Route path="/calls/:gameId" element={<CallLogPage />} /></Routes></MemoryRouter>);
}

describe("CallLogPage", () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth("me", null);
    calls.current = [];
    addCallLog.mockReset(); setCallMatch.mockReset(); suggest.mockReset();
  });
  afterEach(cleanup);

  it("logs a call against the game", async () => {
    addCallLog.mockImplementation(async (_g: string, note: string) => { const e = entry({ note }); calls.current = [e]; return e; });
    renderPage();
    expect(await screen.findByText("Central vs North")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/call you weren't sure about/i), { target: { value: "Three seconds in the lane?" } });
    fireEvent.click(screen.getByRole("button", { name: /add call/i }));
    await waitFor(() => expect(addCallLog).toHaveBeenCalledWith("g1", "Three seconds in the lane?"));
    expect(await screen.findByText("Three seconds in the lane?")).toBeInTheDocument();
  });

  it("suggests a rule with its citation, and accepting queues it", async () => {
    calls.current = [entry()];
    suggest.mockResolvedValue('{"id": "play:p1", "reason": "A legal guarding position was set first."}');
    setCallMatch.mockImplementation(async (id: string, m: unknown) => entry({ id, match: [m], status: { queued: null } }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /suggest a rule/i }));
    const suggestion = await screen.findByRole("region", { name: /suggested rule/i });
    expect(within(suggestion).getByText(/10\.6\.1 Sit\. A/)).toBeInTheDocument();
    expect(within(suggestion).getByText(/legal guarding position was set first/)).toBeInTheDocument();
    expect(suggest.mock.calls[0][1]).toContain("play:p1 | 10.6.1 Sit. A");
    fireEvent.click(within(suggestion).getByRole("button", { name: /accept/i }));
    await waitFor(() => expect(setCallMatch).toHaveBeenCalledWith("call0", { articleId: "s:art10", citation: "10.6.1 Sit. A", playId: ["p1"] }));
    expect(await screen.findByText(/in your review queue/i)).toBeInTheDocument();
  });

  it("lets the official change the suggestion to another rule", async () => {
    calls.current = [entry()];
    suggest.mockResolvedValue('{"id": "s:art10", "reason": "Fouls."}');
    setCallMatch.mockImplementation(async (id: string, m: unknown) => entry({ id, match: [m], status: { queued: null } }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /suggest a rule/i }));
    await screen.findByRole("region", { name: /suggested rule/i });
    fireEvent.change(screen.getByLabelText(/choose the rule/i), { target: { value: "s:art4" } });
    fireEvent.click(screen.getByRole("button", { name: /use this rule/i }));
    await waitFor(() => expect(setCallMatch).toHaveBeenCalledWith("call0", { articleId: "s:art4", citation: "Art. 4", playId: [] }));
  });

  it("falls back to picking the rule by hand when the suggestion can't be used", async () => {
    calls.current = [entry()];
    suggest.mockRejectedValue(new Error("The AI assistant isn't configured yet"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /suggest a rule/i }));
    expect(await screen.findByText(/couldn't suggest a rule/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/choose the rule/i)).toBeInTheDocument();
  });

  it("shows a queued call's rule", async () => {
    calls.current = [entry({ match: [{ articleId: "s:art10", citation: "Art. 10", playId: [] }], status: { queued: null } })];
    renderPage();
    expect(await screen.findByText(/Art\. 10/)).toBeInTheDocument();
    expect(screen.getByText(/in your review queue/i)).toBeInTheDocument();
  });
});
