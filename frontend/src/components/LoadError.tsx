import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";

/** What a page shows when its data didn't load, with a retry. */
export default function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" style={{ padding: "24px 16px", textAlign: "center", color: T.muted }}>
      <div style={{ marginBottom: 12 }}>{t("common.error")}</div>
      <button
        onClick={onRetry}
        style={{ minHeight: 44, padding: "0 20px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 15, cursor: "pointer" }}
      >
        {t("common.retry")}
      </button>
    </div>
  );
}
