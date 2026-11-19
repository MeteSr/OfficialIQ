import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";

const recordStudyBeat = vi.fn(() => Promise.resolve());
vi.mock("../services/user", () => ({ userService: { recordStudyBeat: () => recordStudyBeat() } }));

import { useStudyTimer } from "./useStudyTimer";
import { useAuthStore } from "../store/authStore";

function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useStudyTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recordStudyBeat.mockClear();
    setVisibility("visible");
    useAuthStore.getState().setAuth("aaaaa-aa", null);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAuthStore.getState().clear();
  });

  it("beats at once and then every minute while active", () => {
    renderHook(() => useStudyTimer(true));
    expect(recordStudyBeat).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(recordStudyBeat).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(120_000);
    expect(recordStudyBeat).toHaveBeenCalledTimes(4);
  });

  it("does nothing while inactive or signed out", () => {
    renderHook(() => useStudyTimer(false));
    vi.advanceTimersByTime(180_000);
    useAuthStore.getState().clear();
    renderHook(() => useStudyTimer(true));
    vi.advanceTimersByTime(180_000);
    expect(recordStudyBeat).not.toHaveBeenCalled();
  });

  it("stops when it goes inactive or unmounts", () => {
    const { rerender, unmount } = renderHook(({ on }) => useStudyTimer(on), { initialProps: { on: true } });
    rerender({ on: false });
    vi.advanceTimersByTime(180_000);
    expect(recordStudyBeat).toHaveBeenCalledTimes(1);
    rerender({ on: true });
    unmount();
    vi.advanceTimersByTime(180_000);
    expect(recordStudyBeat).toHaveBeenCalledTimes(2);
  });

  it("skips beats while the page is hidden and beats again on return", () => {
    renderHook(() => useStudyTimer(true));
    setVisibility("hidden");
    vi.advanceTimersByTime(180_000);
    expect(recordStudyBeat).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(recordStudyBeat).toHaveBeenCalledTimes(2);
  });

  it("keeps beating in the background when asked to (audio)", () => {
    renderHook(() => useStudyTimer(true, { inBackground: true }));
    setVisibility("hidden");
    vi.advanceTimersByTime(120_000);
    expect(recordStudyBeat).toHaveBeenCalledTimes(3);
  });
});
