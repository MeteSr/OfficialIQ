import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../i18n";

const flags = vi.hoisted(() => ({
  features: { paywall: true, checkout: { monthly: "https://buy.stripe.com/test_m", yearly: "", portal: "https://billing.stripe.com/p/login/test" } },
}));
vi.mock("../lib/features", () => flags);

import PlanRow from "./PlanRow";
import { useAuthStore } from "../store/authStore";
import { usePlanStore } from "../store/planStore";
import type { MyEntitlement } from "../lib/plan";

const until = Date.now() + 10 * 86_400_000;
const PRO: MyEntitlement = {
  tier: { pro: null }, paywallEnabled: true,
  entitlements: [{ tier: { pro: null }, source: { web: "sub_1" }, expiresAt: BigInt(until) * 1_000_000n, updatedAt: 0n }],
};

describe("PlanRow", () => {
  beforeEach(() => {
    flags.features.paywall = true;
    useAuthStore.getState().setAuth("abcde-fgh", null);
    usePlanStore.setState({ mine: { tier: { free: null }, paywallEnabled: true, entitlements: [] }, loaded: true });
  });
  afterEach(() => cleanup());

  it("shows Free with an upgrade that opens the Pro offer", () => {
    render(<PlanRow />);
    expect(screen.getByText("Free")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows Pro with its end date and the subscription portal", () => {
    usePlanStore.setState({ mine: PRO, loaded: true });
    render(<PlanRow />);
    expect(screen.getByText(new RegExp(new Date(until).toLocaleDateString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage subscription" })).toHaveAttribute("href", "https://billing.stripe.com/p/login/test");
    expect(screen.queryByRole("button", { name: "Upgrade" })).toBeNull();
  });

  it("isn't shown while the paywall is off", () => {
    flags.features.paywall = false;
    const { container } = render(<PlanRow />);
    expect(container).toBeEmptyDOMElement();
  });
});
