import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../i18n";

const startGradedSession = vi.fn();
const getMyWeakArticles = vi.fn();
vi.mock("../services/exam", async (orig) => ({
  ...(await orig<typeof import("../services/exam")>()),
  examService: { gradingAvailable: () => true, startGradedSession: (...a: unknown[]) => startGradedSession(...a) },
}));
vi.mock("../services/question", () => ({ questionService: { getMyWeakArticles: (...a: unknown[]) => getMyWeakArticles(...a) } }));
vi.mock("../services/content", () => ({
  contentService: {
    listArticles: async () => [{ id: "s:art1", title: "Fouls" }, { id: "s:art2", title: "Timing" }, { id: "s:art3", title: "Free throws" }],
    listPointsOfEmphasis: async () => [],
  },
}));
vi.mock("../services/user", () => ({
  userService: {
    getMyUpcomingGames: async () => [{
      id: "g7", opponent: "Central vs North", gameDate: BigInt(Date.now() + 7_200_000) * 1_000_000n,
      sportId: "s", levelId: "varsity", notes: "", createdAt: 0n,
    }],
  },
}));

import RefresherPage from "./RefresherPage";
import { useAuthStore } from "../store/authStore";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/refresher/g7"]}>
      <Routes><Route path="/refresher/:gameId" element={<RefresherPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe("RefresherPage", () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth("me", null);
    startGradedSession.mockReset().mockReturnValue(new Promise(() => {}));
  });
  afterEach(cleanup);

  it("targets the official's most-missed rules, then plays at the game's level", async () => {
    getMyWeakArticles.mockResolvedValue([{ articleId: "s:art3", wrong: 4, answered: 5 }]);
    renderPage();
    expect(await screen.findByText("Free throws")).toBeTruthy();
    expect(screen.getByText(/Central vs North/)).toBeTruthy();
    expect(getMyWeakArticles).toHaveBeenCalledWith("s", 3);

    fireEvent.click(screen.getByText("Start refresher"));
    await waitFor(() => expect(startGradedSession).toHaveBeenCalled());
    const [config, source] = startGradedSession.mock.calls[0];
    expect(config).toMatchObject({ sportId: "s", count: 5n, secPerQ: 60n, mode: { Solo: null } });
    expect(source.Picks[0]).toMatchObject({ articleIds: ["s:art3"], casebook: false, adaptive: true });
    expect(source.Picks[1]).toMatchObject({ articleIds: ["s:art1", "s:art2", "s:art3"], casebook: true });
  });

  it("falls back to the whole level for an official with no misses yet", async () => {
    getMyWeakArticles.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Rules at your level/)).toBeTruthy();
  });
});
