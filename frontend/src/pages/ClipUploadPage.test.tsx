import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "../i18n";

const startUpload = vi.fn(async () => ({ uploadId: "uid9", uploadUrl: "https://upload.example/uid9" }));
const create = vi.fn(async (input: unknown) => ({ id: "clip0", ...(input as object) }));
const uploadVideo = vi.fn(async (_url: string, _file: File, onProgress: (f: number) => void) => { onProgress(1); });
vi.mock("../services/clips", () => ({
  clipService: { startUpload: () => startUpload(), create: (i: unknown) => create(i) },
  uploadVideo: (u: string, f: File, p: (f: number) => void) => uploadVideo(u, f, p),
}));
vi.mock("../lib/sport", () => ({ useSport: () => ({ sportId: "s", levelId: "varsity" }) }));
vi.mock("../services/association", () => ({ associationService: { getMyAssociations: async () => [{ id: "a1", name: "Metro Officials" }] } }));
vi.mock("../services/content", () => ({
  contentService: {
    // Invented rule text.
    listArticles: async () => [{ id: "s:art4", number: 4n, title: "Definitions", body: "SECTION 1. BALL\nArt. 1. Round.\nSECTION 2. COURT\nArt. 1. Flat." }],
    listPlays: async () => [{ id: "p1", citation: "A.R. 4–1", scenario: "Facts.", ruling: "A charge." }],
  },
}));

import ClipUploadPage from "./ClipUploadPage";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ClipUploadPage", () => {
  it("uploads the file, then saves the clip with its rule, call, audience and rights", async () => {
    render(<MemoryRouter><ClipUploadPage /></MemoryRouter>);
    await screen.findByRole("option", { name: "SECTION 2. COURT" });
    fireEvent.change(screen.getByLabelText(/Section/), { target: { value: "s:art4:s2" } });
    await screen.findByRole("option", { name: /A.R. 4–1/ });
    fireEvent.change(screen.getByLabelText(/Ruling it shows/), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "Block or charge" } });
    const file = new File(["video"], "play.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText(/Video file/), { target: { files: [file] } });
    fireEvent.click(screen.getByLabelText(/You make the call/));
    fireEvent.change(screen.getByLabelText(/Stop at/), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText(/Question/), { target: { value: "What's the call?" } });
    fireEvent.change(screen.getByLabelText("Choice A"), { target: { value: "Block" } });
    fireEvent.change(screen.getByLabelText("Choice B"), { target: { value: "Charge" } });
    fireEvent.click(screen.getByLabelText("B is right"));
    // The ruling's text fills in the explanation.
    expect((screen.getByLabelText(/Explanation/) as HTMLTextAreaElement).value).toBe("A charge.");
    fireEvent.change(screen.getByLabelText(/Who can watch/), { target: { value: "a1" } });

    fireEvent.click(screen.getByRole("button", { name: /Upload/ }));
    expect(await screen.findByText(/needs: .*rights/i)).toBeInTheDocument();
    expect(startUpload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/I filmed this footage/));
    fireEvent.click(screen.getByRole("button", { name: /Upload/ }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(uploadVideo).toHaveBeenCalledWith("https://upload.example/uid9", file, expect.any(Function));
    expect(create.mock.calls[0][0]).toMatchObject({
      uploadId: "uid9", sportId: "s", articleId: "s:art4", sectionKey: ["s:art4:s2"], playId: ["p1"], title: "Block or charge",
      callAtSec: [7n], visibility: { association: "a1" }, rightsAttested: true,
      question: [{ stem: "What's the call?", choices: [{ id: "a", text: "Block" }, { id: "b", text: "Charge" }], correctId: "b", explanation: "A charge." }],
    });
    expect(await screen.findByText(/sent for review/i)).toBeInTheDocument();
  });
});
