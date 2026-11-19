import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { features } from "../lib/features";
import { checkoutUrl, FREE_HISTORY_DAYS, PRO_PRICE_MONTHLY, PRO_PRICE_YEARLY, TRIAL_DAYS } from "../lib/plan";
import { useAuthStore } from "../store/authStore";
import { usePlan } from "../store/planStore";

export type UpgradeReason = "ai" | "history" | "feature";

/**
 * The Pro upsell (issue #71): opens when a free official reaches something
 * Pro unlocks. Renders nothing while the paywall is off or for Pro, so
 * callers can open it unconditionally. Checkout is a Stripe Payment Link
 * tagged with the official's principal; Stripe sends them back to
 * /upgrade/return, which claims the subscription.
 */
export default function UpgradeSheet({ open, reason, onClose }: { open: boolean; reason: UpgradeReason; onClose: () => void }) {
  const { t } = useTranslation();
  const { principal } = useAuthStore();
  const plan = usePlan();
  if (!open || !features.paywall || plan.pro) return null;

  const monthly = checkoutUrl(features.checkout.monthly, principal);
  const yearly = checkoutUrl(features.checkout.yearly, principal);
  const why = {
    ai: t("plan.whyAi"),
    history: t("plan.whyHistory", { days: FREE_HISTORY_DAYS }),
    feature: t("plan.whyFeature"),
  }[reason];

  const option = { display: "block", padding: "14px 16px", borderRadius: 10, textDecoration: "none", fontFamily: T.font, fontWeight: 700, fontSize: 15, textAlign: "center" } as const;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="upgrade-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 430, background: T.surface, borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: "20px 16px 28px", fontFamily: T.font, color: T.text }}
      >
        <div id="upgrade-title" style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 24, marginBottom: 6 }}>{t("plan.upgradeTitle")}</div>
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 14 }}>{why}</div>
        <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
          <li>{t("plan.perkAi")}</li>
          <li>{t("plan.perkHistory")}</li>
          <li>{t("plan.perkReadiness")}</li>
          <li>{t("plan.perkRefresher")}</li>
        </ul>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t("plan.trial", { days: TRIAL_DAYS })}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {yearly && (
            <a href={yearly} style={{ ...option, background: fill.accent, color: fill.onAccent }}>
              {t("plan.yearly", { price: PRO_PRICE_YEARLY })}
            </a>
          )}
          {monthly && (
            <a href={monthly} style={{ ...option, background: T.panelAlt, color: T.text, border: `1px solid ${T.border}` }}>
              {t("plan.monthly", { price: PRO_PRICE_MONTHLY })}
            </a>
          )}
          <button onClick={onClose} style={{ minHeight: 44, background: "transparent", border: 0, color: T.muted, fontFamily: T.font, fontSize: 14, cursor: "pointer" }}>
            {t("plan.notNow")}
          </button>
        </div>
      </div>
    </div>
  );
}
