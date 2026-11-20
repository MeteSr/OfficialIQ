import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../i18n";

const generate = vi.fn(async (..._a: unknown[]) => "[]");
vi.mock("../store/authStore", () => ({ useAuthStore: () => ({ isAuthenticated: true }) }));
vi.mock("../services/aiProxy", () => ({ aiProxyService: { isAdmin: async () => true, generateScenarios: (...a: unknown[]) => generate(...a) } }));
vi.mock("../services/question", () => ({ questionService: { addQuestion: vi.fn() } }));
vi.mock("../services/content", () => ({
  contentService: {
    listSports: async () => [{ id: "s", displayName: "Sport", levels: [{ id: "varsity", displayName: "Varsity" }], rulebookYear: "2030" }],
    // Invented rule text, long enough that the old 4,000-character cut lost its second section.
    listArticles: async () => [{
      id: "s:art4", sportId: "s", levelId: "", number: 4n, title: "Definitions", language: "en", audioUrl: [], createdAt: 0n, updatedAt: 0n,
      body: `SECTION 1. BALL\n${"Art. 1. A ball is round. ".repeat(200)}\nSECTION 2. COURT\nArt. 1. A court is flat.`,
    }],
  },
}));

import ScenarioGeneratorPage from "./ScenarioGeneratorPage";

describe("ScenarioGeneratorPage", () => {
  afterEach(() => { cleanup(); generate.mockClear(); });

  it("sends the chosen section of the rule, so the AI sees all of it", async () => {
    render(<MemoryRouter><ScenarioGeneratorPage /></MemoryRouter>);
    const section = await screen.findByLabelText(/Section/i);
    await waitFor(() => expect(screen.getByRole("option", { name: "SECTION 2. COURT" })).toBeInTheDocument());
    fireEvent.change(section, { target: { value: "s:art4:s2" } });
    fireEvent.click(screen.getByRole("button", { name: /Generate/i }));
    await waitFor(() => expect(generate).toHaveBeenCalled());
    const context = generate.mock.calls[0][1] as string;
    expect(context).toBe("Rule 4 — Definitions\nSECTION 2. COURT\nArt. 1. A court is flat.");
  });
});
