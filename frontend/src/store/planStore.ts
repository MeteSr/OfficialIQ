import { create } from "zustand";
import type { MyEntitlement } from "../lib/plan";
import { effectivePlan, type Plan } from "../lib/plan";
import { features } from "../lib/features";
import { userService } from "../services/user";

// The signed-in official's entitlement (issue #71), loaded once and
// refreshed after a checkout claim, so every screen agrees on the plan
// without a reload.
type PlanState = {
  mine: MyEntitlement | null;
  loaded: boolean;
  refresh: () => Promise<void>;
  set: (mine: MyEntitlement | null) => void;
};

export const usePlanStore = create<PlanState>((set) => ({
  mine: null,
  loaded: false,
  refresh: async () => {
    if (!features.paywall) { set({ loaded: true }); return; }
    try {
      set({ mine: await userService.getMyEntitlement(), loaded: true });
    } catch {
      // Unknown: treated as free in the UI; the canisters still enforce the real tier.
      set({ loaded: true });
    }
  },
  set: (mine) => set({ mine, loaded: true }),
}));

/** The plan as the UI should show it right now. */
export function usePlan(): Plan {
  const mine = usePlanStore((s) => s.mine);
  return effectivePlan(features.paywall, mine, Date.now());
}
