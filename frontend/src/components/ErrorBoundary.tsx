import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "../i18n";
import { T, fill } from "../tokens";
import { reportError } from "../lib/errorReporting";

type Props = {
  children: ReactNode;
  /** Shown as the second button; omitted on the outermost boundary, where there is nothing to go back to. */
  onGoHome?: () => void;
};
type State = { error: Error | null };

// Catches a render error (for example a malformed canister or AI response)
// so it replaces one screen with a message instead of blanking the app.
// The app shell keys its boundary on the route, so navigating away resets it.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[OfficialIQ] render error", error, info.componentStack);
    reportError("crash", error, info.componentStack ?? "");
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const t = i18n.t.bind(i18n);
    return (
      <div role="alert" style={{ padding: "64px 24px", fontFamily: T.font, color: T.text, background: T.bg, minHeight: "60dvh", textAlign: "center" }}>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 24 }}>{t("errorBoundary.title")}</div>
        <div style={{ fontSize: 14, color: T.muted, marginTop: 10, lineHeight: 1.4 }}>{t("errorBoundary.body")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          <button
            onClick={this.reset}
            style={{ minHeight: 48, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 15, cursor: "pointer" }}
          >
            {t("common.retry")}
          </button>
          {this.props.onGoHome && (
            <button
              onClick={() => { this.reset(); this.props.onGoHome?.(); }}
              style={{ minHeight: 48, background: "transparent", color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 15, cursor: "pointer" }}
            >
              {t("errorBoundary.goHome")}
            </button>
          )}
        </div>
      </div>
    );
  }
}
