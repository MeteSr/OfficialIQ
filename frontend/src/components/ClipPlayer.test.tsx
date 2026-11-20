import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../i18n";
import ClipPlayer from "./ClipPlayer";

// jsdom has no media playback: play and pause are stubbed.
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const question = {
  stem: "What's the call?", choices: [{ id: "a", text: "Block" }, { id: "b", text: "Charge" }],
  correctId: "b", explanation: "The defender was set.",
};

function at(video: HTMLVideoElement, t: number, event = "timeupdate") {
  Object.defineProperty(video, "currentTime", { value: t, writable: true, configurable: true });
  fireEvent(video, new Event(event));
}

describe("ClipPlayer", () => {
  it("stops at the call, asks for it, then shows the ruling and plays on", () => {
    const onAnswer = vi.fn();
    const { container } = render(<ClipPlayer src="https://v.example/c.mp4" callAtSec={7} question={question} onAnswer={onAnswer} />);
    const video = container.querySelector("video")!;
    at(video, 6);
    expect(screen.queryByText("What's the call?")).toBeNull();
    at(video, 7.1);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    expect(onAnswer).toHaveBeenCalledWith(false);
    expect(screen.getByText(/The defender was set/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Watch the rest/ }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("won't skip past the call before it's answered", () => {
    const { container } = render(<ClipPlayer src="https://v.example/c.mp4" callAtSec={7} question={question} />);
    const video = container.querySelector("video")!;
    at(video, 12, "seeking");
    expect(video.currentTime).toBe(7);
  });

  it("just plays a clip with no call", () => {
    const { container } = render(<ClipPlayer src="https://v.example/c.mp4" callAtSec={null} question={null} />);
    at(container.querySelector("video")!, 30);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
  });
});
