import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "../i18n";

const flags = vi.hoisted(() => ({
  features: { paywall: true, checkout: { monthly: "https://buy.stripe.com/test_m", yearly: "https://buy.stripe.com/test_y", portal: "" } },
}));
vi.mock("../lib/features", () => flags);

import UpgradeSheet from "./UpgradeSheet";
import { useAuthStore } from "../store/authStore";
import { usePlanStore } from "../store/planStore";
import type { MyEntitlement } from "../lib/plan";

const FREE: MyEntitlement = { tier: { free: null }, paywallEnabled: true, entitlements: [] };
const PRO: MyEntitlement = {
  tier: { pro: null }, paywallEnabled: true,
  entitlements: [{ tier: { pro: null }, source: { comp: null }, expiresAt: BigInt(Date.now() + 86_400_000) * 1_000_000n, updatedAt: 0n }],
};

describe("UpgradeSheet", () => {
  beforeEach(() => {
    flags.features.paywall = true;
    useAuthStore.getState().setAuth("abcde-fgh", null);
    usePlanStore.setState({ mine: FREE, loaded: true });
  });
  afterEach(() => cleanup());

  it("offers monthly and yearly Pro to a free official, tagged with their principal", () => {
    render(<UpgradeSheet open reason="ai" onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const monthly = screen.getByRole("link", { name: /\$7\.99/ });
    expect(monthly).toHaveAttribute("href", "https://buy.stripe.com/test_m?client_reference_id=abcde-fgh");
    expect(screen.getByRole("link", { name: /\$49\.99/ })).toHaveAttribute("href", "https://buy.stripe.com/test_y?client_reference_id=abcde-fgh");
    expect(screen.getByText(/14-day free trial/i)).toBeInTheDocument();
  });

  it("says why it opened", () => {
    render(<UpgradeSheet open reason="history" onClose={() => {}} />);
    expect(screen.getByText(/last 30 days/i)).toBeInTheDocument();
  });

  it("stays closed for a Pro official", () => {
    usePlanStore.setState({ mine: PRO, loaded: true });
    render(<UpgradeSheet open reason="ai" onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays closed while the paywall is off", () => {
    flags.features.paywall = false;
    render(<UpgradeSheet open reason="ai" onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays closed when not open", () => {
    render(<UpgradeSheet open={false} reason="ai" onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
