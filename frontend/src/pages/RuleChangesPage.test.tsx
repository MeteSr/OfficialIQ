import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "../i18n";

const list = vi.fn();
vi.mock("../services/content", () => ({ contentService: { listRuleChanges: (s: string, season: string) => list(s, season) } }));

import RuleChangesPage from "./RuleChangesPage";
import { currentSeason } from "../lib/ruleChanges";

const change = (id: string, articleId: string, oldText: string) => ({
  id, sportId: "ncaa_basketball", season: currentSeason(Date.now()), articleId, citation: "Rule 4-1",
  title: `Change ${id}`, oldText, newText: `New wording ${id}`, summary: `Why ${id}`, source: "Test edition",
  createdAt: 0n, updatedAt: 0n,
});

function QuizProbe() {
  const loc = useLocation();
  return <div data-testid="quiz">{JSON.stringify({ path: loc.pathname, state: loc.state })}</div>;
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/rule-changes"]}>
      <Routes>
        <Route path="/rule-changes" element={<RuleChangesPage />} />
        <Route path="/quiz/:articleId" element={<QuizProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RuleChangesPage", () => {
  afterEach(() => { cleanup(); list.mockReset(); });

  it("shows each change's old and new wording, and marks a brand-new rule", async () => {
    list.mockResolvedValue([change("a", "ncaa_basketball:art4", "Old wording a"), change("b", "ncaa_basketball:art9", "")]);
    renderPage();
    expect(await screen.findByText("Change a")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith("ncaa_basketball", currentSeason(Date.now()));
    expect(screen.getByText("Old wording a")).toBeInTheDocument();
    expect(screen.getByText("New wording a")).toBeInTheDocument();
    expect(screen.getByText(/New rule/)).toBeInTheDocument();
    expect(screen.getAllByText(/Test edition/)).toHaveLength(2);
  });

  it("starts a quiz on just the changed articles and tagged questions", async () => {
    list.mockResolvedValue([change("a", "ncaa_basketball:art4", "x"), change("b", "ncaa_basketball:art4", "y"), change("c", "ncaa_basketball:art9", "z")]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Quiz me/ }));
    const probe = JSON.parse(screen.getByTestId("quiz").textContent!);
    expect(probe.path).toBe("/quiz/ncaa_basketball:art4");
    expect(probe.state).toEqual({
      articleIds: ["ncaa_basketball:art4", "ncaa_basketball:art9"], casebook: false,
      tag: `rule-change:${currentSeason(Date.now())}`,
    });
  });

  it("says so when the season has no changes yet", async () => {
    list.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/No rule changes have been published/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quiz me/ })).toBeNull();
  });

  it("shows a retry when the list doesn't load", async () => {
    list.mockRejectedValue(new Error("down"));
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
