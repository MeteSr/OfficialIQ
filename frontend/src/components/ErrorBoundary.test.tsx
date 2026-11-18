import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";
import "../i18n";

let shouldThrow = true;
function Flaky() {
  if (shouldThrow) throw new Error("bad render");
  return <div>recovered</div>;
}

describe("ErrorBoundary", () => {
  it("shows a message instead of a blank screen, and recovers on retry", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const goHome = vi.fn();
    render(<ErrorBoundary onGoHome={goHome}><Flaky /></ErrorBoundary>);
    expect(screen.getByRole("alert")).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByText("Try Again"));
    expect(screen.getByText("recovered")).toBeTruthy();
    spy.mockRestore();
  });
});
