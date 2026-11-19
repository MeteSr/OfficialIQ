import { useState } from "react";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { features } from "../lib/features";
import { usePlan } from "../store/planStore";
import UpgradeSheet from "./UpgradeSheet";

/** The "Plan" row on /me (issue #71): Free with an upgrade, or Pro with its end date and the Stripe portal. */
export default function PlanRow() {
  const { t } = useTranslation();
  const plan = usePlan();
  const [open, setOpen] = useState(false);
  if (!plan.gated) return null;

  const status = plan.pro
    ? (plan.proUntil ? t("plan.rowProUntil", { date: new Date(plan.proUntil).toLocaleDateString() }) : t("plan.rowPro"))
    : t("plan.rowFree");
  const action = { minHeight: 36, padding: "0 12px", borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 13, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" } as const;

  return (
    <div style={{ minHeight: 52, padding: "10px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>{t("plan.rowTitle")}</div>
        <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 14, color: T.text }}>{status}</div>
      </div>
      {!plan.pro && (
        <button onClick={() => setOpen(true)} style={{ ...action, background: fill.accent, color: fill.onAccent, border: 0 }}>{t("plan.upgrade")}</button>
      )}
      {plan.pro && features.checkout.portal && (
        <a href={features.checkout.portal} style={{ ...action, background: "transparent", color: T.text, border: `1px solid ${T.border}` }}>{t("plan.manage")}</a>
      )}
      <UpgradeSheet open={open} reason="feature" onClose={() => setOpen(false)} />
    </div>
  );
}
