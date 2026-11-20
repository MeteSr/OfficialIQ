import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../i18n";

const clip = (id: string, articleId: string, over: Record<string, unknown> = {}) => ({
  id, articleId, sportId: "s", title: `Clip ${id}`, description: "", status: { approved: null }, visibility: { everyone: null },
  callAtSec: [], question: [], playId: [], sectionKey: [], uploadId: "u", createdAt: 0n, reviewedBy: [], ...over,
});
const review = vi.fn(async (id: string, approve: boolean) => ({ ...clip(id, "s:art2"), status: approve ? { approved: null } : { rejected: null } }));
vi.mock("../services/clips", () => ({
  clipService: {
    list: async () => [clip("c1", "s:art10"), clip("c2", "s:art2", { status: { pending: null } })],
    listForAssociation: async () => [clip("c3", "s:art2", { visibility: { association: "a1" }, callAtSec: [7n] })],
    toReview: async () => [clip("c4", "s:art2", { status: { pending: null } })],
    review: (id: string, approve: boolean) => review(id, approve),
  },
}));
vi.mock("../lib/sport", () => ({ useSport: () => ({ sportId: "s", levelId: "varsity" }) }));
vi.mock("../services/association", () => ({ associationService: { getMyAssociations: async () => [{ id: "a1", name: "Metro Officials" }] } }));
vi.mock("../services/content", () => ({
  contentService: { listArticles: async () => [{ id: "s:art2", number: 2n, title: "Officials" }, { id: "s:art10", number: 10n, title: "Fouls" }] },
}));

import FilmRoomPage from "./FilmRoomPage";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("FilmRoomPage", () => {
  it("lists clips under their rule, with an association's clips and the caller's waiting ones marked", async () => {
    render(<MemoryRouter><FilmRoomPage /></MemoryRouter>);
    const rule2 = await screen.findByRole("region", { name: /Rule 2: Officials/ });
    expect(within(rule2).getByText("Clip c2")).toBeInTheDocument();
    expect(within(rule2).getByText(/Waiting for review/)).toBeInTheDocument();
    expect(within(rule2).getByText("Clip c3")).toBeInTheDocument();
    expect(within(rule2).getByText(/Metro Officials/)).toBeInTheDocument();
    expect(within(rule2).getByText(/You make the call/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Rule 10: Fouls/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upload a clip/ })).toHaveAttribute("href", "/clips/new");
  });

  it("lets a reviewer approve a waiting clip", async () => {
    render(<MemoryRouter><FilmRoomPage /></MemoryRouter>);
    const queue = await screen.findByRole("region", { name: /To review/ });
    fireEvent.click(within(queue).getByRole("button", { name: /Approve/ }));
    await waitFor(() => expect(review).toHaveBeenCalledWith("c4", true));
    await waitFor(() => expect(screen.queryByRole("region", { name: /To review/ })).toBeNull());
  });
});
