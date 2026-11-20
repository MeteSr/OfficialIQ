import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../i18n";

vi.mock("../services/clips", () => ({
  clipService: {
    playback: async (id: string) => ({
      url: `https://customer-x.cloudflarestream.com/tok/downloads/default.mp4?${id}`,
      clip: { id, title: "Block or charge", description: "Watch the defender's feet.", articleId: "s:art4", callAtSec: [7n],
        question: [{ stem: "What's the call?", choices: [{ id: "a", text: "Block" }], correctId: "a", explanation: "Set." }] },
    }),
  },
}));

import ClipPage from "./ClipPage";

afterEach(cleanup);

describe("ClipPage", () => {
  it("plays the clip from its signed link, with its title and what to watch for", async () => {
    const { container } = render(<MemoryRouter initialEntries={["/clips/clip3"]}><Routes><Route path="/clips/:id" element={<ClipPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("Block or charge")).toBeInTheDocument();
    expect(screen.getByText("Watch the defender's feet.")).toBeInTheDocument();
    expect(container.querySelector("video")!.getAttribute("src")).toBe("https://customer-x.cloudflarestream.com/tok/downloads/default.mp4?clip3");
  });
});
