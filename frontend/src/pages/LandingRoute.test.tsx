import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import en from "../i18n/en.json";
import "../i18n";
import { useAuthStore } from "../store/authStore";
import LandingRoute from "./LandingRoute";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn(), devLogin: vi.fn() }),
}));

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/home" element={<div>home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  useAuthStore.setState({ isAuthenticated: false, isLoading: true });
});

describe("LandingRoute", () => {
  // The prerendered landing page is already on screen; showing nothing while
  // the session check runs would blank it out.
  it("shows the landing page while the session check is still running", () => {
    useAuthStore.setState({ isAuthenticated: false, isLoading: true });
    renderAt();
    expect(screen.getByRole("heading", { level: 1, name: en.landing.heroTitle })).toBeInTheDocument();
  });

  it("shows the landing page to a signed-out visitor", () => {
    useAuthStore.setState({ isAuthenticated: false, isLoading: false });
    renderAt();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("sends a signed-in official to the home screen", () => {
    useAuthStore.setState({ isAuthenticated: true, isLoading: false });
    renderAt();
    expect(screen.getByText("home screen")).toBeInTheDocument();
  });
});
