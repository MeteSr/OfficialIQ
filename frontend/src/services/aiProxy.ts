import { IDL } from "@icp-sdk/core/candid";
import { createActor } from "./actor";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RateLimitStatus = { used: number; limitPerDay: number; resetAt: number };

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const ResultUnit = I.Variant({ ok: I.Null, err: I.Text });
  const ResultText = I.Variant({ ok: I.Text, err: I.Text });
  const RateLimitStatus = I.Record({ used: I.Nat, limitPerDay: I.Nat, resetAt: I.Int });
  return I.Service({
    isAdminCaller:             I.Func([], [I.Bool], ["query"]),
    isConfigured:              I.Func([], [I.Bool], ["query"]),
    getMyRateLimitStatus:      I.Func([], [RateLimitStatus], ["query"]),
    askRuleAssistant:          I.Func([I.Text, I.Text], [ResultText], []),
    generatePersonalizedDrills: I.Func([I.Text, I.Nat], [ResultText], []),
    generateScenarios:         I.Func([I.Text, I.Text, I.Nat], [ResultText], []),
    setAnthropicKey:           I.Func([I.Text], [ResultUnit], []),
    setClaudeModel:            I.Func([I.Text], [ResultUnit], []),
    metrics:                   I.Func([], [I.Record({ ok: I.Bool, aiConfigured: I.Bool })], ["query"]),
  });
};

// ─── Service ──────────────────────────────────────────────────────────────────

const CANISTER_ID = typeof CANISTER_ID_AI_PROXY !== "undefined" ? CANISTER_ID_AI_PROXY : "";

function actor() {
  return createActor<{
    isAdminCaller:              () => Promise<boolean>;
    isConfigured:               () => Promise<boolean>;
    getMyRateLimitStatus:       () => Promise<{ used: bigint; limitPerDay: bigint; resetAt: bigint }>;
    askRuleAssistant:           (question: string, context: string) => Promise<{ ok: string } | { err: string }>;
    generatePersonalizedDrills: (weakAreasContext: string, count: bigint) => Promise<{ ok: string } | { err: string }>;
    generateScenarios:          (instructions: string, articleContext: string, count: bigint) => Promise<{ ok: string } | { err: string }>;
  }>(CANISTER_ID, idlFactory);
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
    if (!CANISTER_ID) return { used: 0, limitPerDay: 0, resetAt: 0 };
    const r = await actor().getMyRateLimitStatus();
    return { used: Number(r.used), limitPerDay: Number(r.limitPerDay), resetAt: Number(r.resetAt) };
  },

  async askRuleAssistant(question: string, context: string): Promise<string> {
    if (!CANISTER_ID) throw new Error("AI assistant canister not deployed");
    const res = await actor().askRuleAssistant(question, context);
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
