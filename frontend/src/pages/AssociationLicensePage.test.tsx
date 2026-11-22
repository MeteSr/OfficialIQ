import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Principal } from "@icp-sdk/core/principal";
import "../i18n";

const { COORD, A, B, C } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Principal: P } = require("@icp-sdk/core/principal") as typeof import("@icp-sdk/core/principal");
  return {
    COORD: P.fromText("aaaaa-aa"),
    A: P.fromText("2vxsx-fae"),
    B: P.fromText("rrkah-fqaaa-aaaaa-aaaaq-cai"),
    C: P.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"),
  };
});
const DAY = 86_400_000;
const ns = (ms: number) => BigInt(ms) * 1_000_000n;

const getLicense = vi.fn();
const moveSeat = vi.fn();
const startCheckout = vi.fn();
const claim = vi.fn();
vi.mock("../services/association", async () => {
  const actual = await vi.importActual<typeof import("../services/association")>("../services/association");
  return {
    ...actual,
    associationService: {
      getAssociation: async () => ({ id: "asc7", name: "Metro Refs", sport: "ncaa_basketball", coordinator: COORD, joinCode: "X", createdAt: 0n }),
      getAssociationMembers: async () => [COORD, A, B, C],
      getLicense: (id: string) => getLicense(id),
      moveSeat: (id: string, from: Principal, to: Principal) => moveSeat(id, from, to),
      startLicenseCheckout: (id: string, seats: number) => startCheckout(id, seats),
      claimLicense: (id: string, session: string) => claim(id, session),
      refreshLicense: (id: string) => getLicense(id),
    },
  };
});
vi.mock("../services/user", async () => {
  const actual = await vi.importActual<typeof import("../services/user")>("../services/user");
  const names: Record<string, string> = { [A.toText()]: "Avery", [B.toText()]: "Blake", [C.toText()]: "Casey" };
  return { ...actual, userService: { getPublicProfile: async (p: Principal) => ({ displayName: names[p.toText()] ?? "Coord" }) } };
});

import AssociationLicensePage from "./AssociationLicensePage";
import { useAuthStore } from "../store/authStore";

function licenseView(seats: number, holders: Principal[], source: Record<string, unknown> = { manual: null }) {
  return {
    license: [{ seats: BigInt(seats), source, expiresAt: ns(Date.now() + 30 * DAY), updatedAt: 0n }],
    active: true, paywallOn: true, holders, memberCount: 3n, minSeats: 10n, checkoutReady: true,
  };
}

function at(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/association/:id/license" element={<AssociationLicensePage />} /></Routes>
    </MemoryRouter>,
  );
}

describe("AssociationLicensePage", () => {
  beforeEach(() => {
    for (const f of [getLicense, moveSeat, startCheckout, claim]) f.mockReset();
    useAuthStore.getState().setAuth(COORD.toText(), null);
  });
  afterEach(() => cleanup());

  it("shows seats used and who holds them", async () => {
    getLicense.mockResolvedValue(licenseView(2, [A, B]));
    at("/association/asc7/license");
    await screen.findByText(/2 of 2 seats used/);
    expect(screen.getByText("Avery")).toBeInTheDocument();
    expect(screen.getByText("Blake")).toBeInTheDocument();
    // Casey has no seat: listed as such, and offered in the move pickers.
    expect(screen.getByText(/Casey · no seat/)).toBeInTheDocument();
  });

  it("moves a seat to a member without one", async () => {
    getLicense.mockResolvedValue(licenseView(2, [A, B]));
    moveSeat.mockResolvedValue(licenseView(2, [C, B]));
    at("/association/asc7/license");
    await screen.findByText(/2 of 2 seats used/);
    fireEvent.change(screen.getByLabelText(/move avery's seat/i), { target: { value: C.toText() } });
    await waitFor(() => expect(moveSeat).toHaveBeenCalled());
    expect(moveSeat.mock.calls[0][0]).toBe("asc7");
    expect(moveSeat.mock.calls[0][1].toText()).toBe(A.toText());
    expect(moveSeat.mock.calls[0][2].toText()).toBe(C.toText());
  });

  it("won't buy fewer than 10 seats, and shows the yearly price", async () => {
    getLicense.mockResolvedValue(licenseView(25, [A, B, C], { trial: null }));
    startCheckout.mockResolvedValue("https://checkout.stripe.com/c/pay/cs_test_1");
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
    at("/association/asc7/license");
    const picker = await screen.findByLabelText(/seats/i, { selector: "input" });
    expect(picker).toHaveAttribute("min", "10");
    fireEvent.change(picker, { target: { value: "4" } });
    fireEvent.blur(picker);
    expect((picker as HTMLInputElement).value).toBe("10");
    expect(screen.getByText(/\$360/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /buy/i }));
    await waitFor(() => expect(startCheckout).toHaveBeenCalledWith("asc7", 10));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_1"));
  });

  it("claims the license when Stripe sends the coordinator back", async () => {
    getLicense.mockResolvedValue(licenseView(25, [A], { trial: null }));
    claim.mockResolvedValue(licenseView(12, [A, B, C], { stripe: "sub_1" }));
    at("/association/asc7/license?session_id=cs_test_9");
    await waitFor(() => expect(claim).toHaveBeenCalledWith("asc7", "cs_test_9"));
    await screen.findByText(/3 of 12 seats used/);
  });
});
