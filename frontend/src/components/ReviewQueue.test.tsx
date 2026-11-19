import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../i18n";

const queue = vi.fn();
const markReviewed = vi.fn();
vi.mock("../services/user", async (orig) => ({
  ...(await orig<typeof import("../services/user")>()),
  userService: { getMyReviewQueue: () => queue(), markCallReviewed: (id: string) => markReviewed(id) },
}));

import ReviewQueue from "./ReviewQueue";

const call = (id: string, note: string, articleId: string, citation: string) => ({
  id, gameId: "g1", note, match: [{ articleId, citation, playId: [] }], status: { queued: null }, createdAt: 0n, updatedAt: 0n,
});

describe("ReviewQueue", () => {
  afterEach(() => { cleanup(); queue.mockReset(); markReviewed.mockReset(); });

  it("lists queued calls with a quiz on each rule", async () => {
    queue.mockResolvedValue([call("c1", "Block/charge at the top of the key", "s:art10", "10.6.1 Sit. A")]);
    render(<MemoryRouter><ReviewQueue /></MemoryRouter>);
    expect(await screen.findByText(/Block\/charge at the top of the key/)).toBeInTheDocument();
    expect(screen.getByText(/10\.6\.1 Sit\. A/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /quiz this rule/i })).toHaveAttribute("href", "/quiz/s:art10?adaptive=1");
  });

  it("drops a call once it's marked reviewed", async () => {
    queue.mockResolvedValue([call("c1", "First note", "s:art10", "Art. 10"), call("c2", "Second note", "s:art4", "Art. 4")]);
    markReviewed.mockResolvedValue({});
    render(<MemoryRouter><ReviewQueue /></MemoryRouter>);
    fireEvent.click((await screen.findAllByRole("button", { name: /mark reviewed/i }))[0]);
    await waitFor(() => expect(markReviewed).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByText("First note")).toBeNull());
    expect(screen.getByText("Second note")).toBeInTheDocument();
  });

  it("renders nothing when the queue is empty", async () => {
    queue.mockResolvedValue([]);
    const { container } = render(<MemoryRouter><ReviewQueue /></MemoryRouter>);
    await waitFor(() => expect(queue).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
