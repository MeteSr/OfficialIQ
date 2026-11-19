import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../i18n";

const claim = vi.fn();
vi.mock("../services/user", async () => {
  const actual = await vi.importActual<typeof import("../services/user")>("../services/user");
  return { ...actual, userService: { claimWebSubscription: (id: string) => claim(id) } };
});

import UpgradeReturnPage from "./UpgradeReturnPage";
import { ClaimFailed } from "../services/user";
import { useAuthStore } from "../store/authStore";
import { usePlanStore } from "../store/planStore";

const PRO = { tier: { pro: null }, paywallEnabled: true, entitlements: [] };

function at(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/upgrade/return" element={<UpgradeReturnPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe("UpgradeReturnPage", () => {
  beforeEach(() => {
    claim.mockReset();
    useAuthStore.getState().setAuth("abcde-fgh", null);
    usePlanStore.setState({ mine: null, loaded: true });
  });
  afterEach(() => cleanup());

  it("claims the checkout and switches the app to Pro without a reload", async () => {
    claim.mockResolvedValue(PRO);
    at("/upgrade/return?session_id=cs_test_123");
    await screen.findByText(/You're on Pro/);
    expect(claim).toHaveBeenCalledWith("cs_test_123");
    expect(usePlanStore.getState().mine).toEqual(PRO);
  });

  it("explains a refused claim and offers a retry", async () => {
    claim.mockRejectedValue(new ClaimFailed({ notYours: null }));
    at("/upgrade/return?session_id=cs_test_123");
    await screen.findByText(/different account/);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("needs the session id Stripe adds", async () => {
    at("/upgrade/return");
    await waitFor(() => expect(screen.getByText(/link Stripe sends you back/)).toBeInTheDocument());
    expect(claim).not.toHaveBeenCalled();
  });
});
