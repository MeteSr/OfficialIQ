import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";

// /native-callback is where Internet Identity returns a sign-in started by the
// phone app (src/lib/nativeAuth.ts). The OS normally hands that link straight
// to the app, so this page only shows when it didn't — the link was opened on
// a computer, or the app isn't installed. The fragment carries II's response,
// which is useless without the phone's key but still has no business staying
// in the address bar or history.
export default function NativeCallbackPage() {
  const { t } = useTranslation();
  useEffect(() => {
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <div style={{ minHeight: "100dvh", background: T.bg }}>
    <div style={{ maxWidth: 430, margin: "0 auto", padding: "48px 24px", color: T.text }}>
      <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>{t("nativeCallback.title")}</h1>
      <p style={{ fontSize: 15, lineHeight: 1.5, margin: "0 0 24px", color: T.muted }}>{t("nativeCallback.body")}</p>
      <Link to="/" style={{ color: T.red, fontWeight: 600 }}>{t("nativeCallback.web")}</Link>
    </div>
    </div>
  );
}
