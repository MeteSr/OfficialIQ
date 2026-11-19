import { canisterId } from "../lib/icEnv";
import { createActor } from "./actor";
import { idlFactory, type _SERVICE } from "../declarations/ai_proxy";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RateLimitStatus = { used: number; limitPerDay: number; resetAt: number; free: boolean };

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = canisterId("ai_proxy");

function actor() {
  return createActor<_SERVICE>(CANISTER_ID, idlFactory);
}

export const aiProxyService = {
  async isAdmin(): Promise<boolean> {
    if (!CANISTER_ID) return false;
    return actor().isAdminCaller().catch(() => false);
  },

  async isConfigured(): Promise<boolean> {
    if (!CANISTER_ID) return false;
    return actor().isConfigured().catch(() => false);
  },

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    if (!CANISTER_ID) return { used: 0, limitPerDay: 0, resetAt: 0, free: false };
    // The tier-aware status (issue #71); getMyRateLimitStatus is for older builds.
    const r = await actor().getMyAiUsage();
    return { used: Number(r.used), limitPerDay: Number(r.limitPerDay), resetAt: Number(r.resetAt), free: "free" in r.access };
  },

  async askRuleAssistant(question: string, context: string): Promise<string> {
    if (!CANISTER_ID) throw new Error("AI assistant canister not deployed");
    const res = await actor().askRuleAssistant(question, context);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  /** The AI matcher's raw reply for a post-game call (issue #66); parse with lib/callLog.parseSuggestion. */
  async suggestRuleForCall(note: string, candidates: string): Promise<string> {
    if (!CANISTER_ID) throw new Error("AI assistant canister not deployed");
    const res = await actor().suggestRuleForCall(note, candidates);
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async generatePersonalizedDrills(weakAreasContext: string, count: number): Promise<string> {
    if (!CANISTER_ID) throw new Error("AI assistant canister not deployed");
    const res = await actor().generatePersonalizedDrills(weakAreasContext, BigInt(count));
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },

  async generateScenarios(instructions: string, articleContext: string, count: number): Promise<string> {
    if (!CANISTER_ID) throw new Error("AI assistant canister not deployed");
    const res = await actor().generateScenarios(instructions, articleContext, BigInt(count));
    if ("err" in res) throw new Error(res.err);
    return res.ok;
  },
};
