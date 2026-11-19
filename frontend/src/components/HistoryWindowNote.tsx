import { useState } from "react";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { FREE_HISTORY_DAYS } from "../lib/plan";
import { usePlan } from "../store/planStore";
import UpgradeSheet from "./UpgradeSheet";

/**
 * Tells a free official their exam history stops at FREE_HISTORY_DAYS
 * (issue #71: the exam canister returns only that window), with a way to
 * Pro. Renders nothing while the paywall is off or for Pro.
 */
export default function HistoryWindowNote() {
  const { t } = useTranslation();
  const plan = usePlan();
  const [open, setOpen] = useState(false);
  if (!plan.gated || plan.pro) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", margin: "12px 16px 0", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, fontFamily: T.font, fontSize: 13, color: T.muted }}>
      <span style={{ flex: 1 }}>{t("plan.historyNote", { days: FREE_HISTORY_DAYS })}</span>
      <button onClick={() => setOpen(true)} style={{ minHeight: 36, padding: "0 12px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
        {t("plan.seeAll")}
      </button>
      <UpgradeSheet open={open} reason="history" onClose={() => setOpen(false)} />
    </div>
  );
}
