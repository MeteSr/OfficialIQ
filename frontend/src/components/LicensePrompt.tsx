import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { purchasesAllowed } from "../lib/purchases";

/**
 * Shown where a coordinator reaches something the association's seat
 * license unlocks (issue #78) and it has none. On the website it links to
 * the license page; the apps say what it needs and nothing more, with no
 * price or purchase link (#80).
 */
export default function LicensePrompt({ associationId }: { associationId: string }) {
  const { t } = useTranslation();
  return (
    <div role="note" style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16, fontFamily: T.font, color: T.text }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t("license.requiredTitle")}</div>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: purchasesAllowed() ? 12 : 0 }}>{t("license.requiredDesc")}</div>
      {purchasesAllowed() && (
        <Link
          to={`/association/${associationId}/license`}
          style={{ display: "inline-block", padding: "10px 16px", background: fill.accent, color: fill.onAccent, borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
        >
          {t("license.seeLicense")}
        </Link>
      )}
    </div>
  );
}
