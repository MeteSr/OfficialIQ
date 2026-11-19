import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { ClaimFailed, userService } from "../services/user";
import { claimErrorKey } from "../lib/plan";
import { useAuthStore } from "../store/authStore";
import { usePlanStore } from "../store/planStore";

type State = { kind: "working" } | { kind: "done" } | { kind: "error"; key: string } | { kind: "missing" };

/**
 * Where Stripe Checkout sends an official back after paying (issue #71).
 * The Payment Link's success URL is
 * https://<app>/upgrade/return?session_id={CHECKOUT_SESSION_ID}; the user
 * canister checks that session with Stripe itself before granting Pro.
 */
export default function UpgradeReturnPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const { isAuthenticated } = useAuthStore();
  const [state, setState] = useState<State>({ kind: "working" });

  const claim = useCallback(async () => {
    if (!sessionId) { setState({ kind: "missing" }); return; }
    setState({ kind: "working" });
    try {
      usePlanStore.getState().set(await userService.claimWebSubscription(sessionId));
      setState({ kind: "done" });
    } catch (e) {
      setState({ kind: "error", key: e instanceof ClaimFailed ? claimErrorKey(e.reason) : "plan.errTryAgain" });
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) { setState({ kind: "missing" }); return; }
    if (!isAuthenticated) { setState({ kind: "error", key: "plan.errSignIn" }); return; }
    claim();
  }, [sessionId, isAuthenticated, claim]);

  const button = { minHeight: 44, padding: "0 20px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 15, cursor: "pointer" } as const;

  return (
    <div style={{ padding: "64px 16px 24px", textAlign: "center", fontFamily: T.font, color: T.text }}>
      <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 26, marginBottom: 12 }}>{t("plan.returnTitle")}</div>
      {state.kind === "working" && <div style={{ color: T.muted }}>{t("plan.returnWorking")}</div>}
      {state.kind === "missing" && <div style={{ color: T.muted }}>{t("plan.returnMissing")}</div>}
      {state.kind === "done" && (
        <>
          <div style={{ marginBottom: 20 }}>{t("plan.returnDone")}</div>
          <button style={button} onClick={() => navigate("/me")}>{t("plan.returnContinue")}</button>
        </>
      )}
      {state.kind === "error" && (
        <div role="alert">
          <div style={{ color: T.wrong, marginBottom: 20 }}>{t(state.key)}</div>
          {state.key !== "plan.errSignIn" && <button style={button} onClick={claim}>{t("plan.retry")}</button>}
        </div>
      )}
    </div>
  );
}
