import { useState } from "react";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { questionService, REPORT_REASONS, type ReportReason } from "../services/question";

/**
 * "Report a problem" under a revealed question: the official picks why the
 * question looks wrong, adds an optional note, and it lands in the admin
 * moderation queue. Signed-in officials only (reports are one per official
 * per question).
 */
export default function ReportQuestionButton({ questionId }: { questionId: string }) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) return null;

  if (state === "sent") {
    return <div role="status" style={{ marginTop: 10, fontSize: 12.5, color: T.muted }}>{t("reportQuestion.thanks")}</div>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ marginTop: 10, minHeight: 44, padding: 0, background: "transparent", border: 0, color: T.muted, fontFamily: T.font, fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}
      >
        {t("reportQuestion.open")}
      </button>
    );
  }

  async function submit() {
    if (!reason) return;
    setState("sending");
    setError(null);
    try {
      await questionService.reportQuestion(questionId, reason, note.trim());
      setState("sent");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(/already reported/i.test(msg) ? t("reportQuestion.already") : t("reportQuestion.failed"));
      setState("error");
    }
  }

  return (
    <div style={{ marginTop: 12, padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 8 }}>{t("reportQuestion.title")}</div>
      <div role="radiogroup" aria-label={t("reportQuestion.title")} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {REPORT_REASONS.map((r) => (
          <button
            key={r}
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            style={{
              minHeight: 36, padding: "0 10px", borderRadius: 6, cursor: "pointer", fontFamily: T.font, fontSize: 12.5,
              border: `1px solid ${reason === r ? fill.accent : T.border}`,
              background: reason === r ? fill.accent : "transparent",
              color: reason === r ? fill.onAccent : T.text,
            }}
          >
            {t(`reportQuestion.reason${r}`)}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        placeholder={t("reportQuestion.notePlaceholder")}
        rows={2}
        style={{ width: "100%", marginTop: 8, padding: 8, borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontFamily: T.font, fontSize: 13, boxSizing: "border-box" }}
      />
      {error && <div role="alert" style={{ fontSize: 12, color: T.wrong, marginTop: 6 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={submit}
          disabled={!reason || state === "sending"}
          style={{ flex: 1, minHeight: 44, border: 0, borderRadius: 8, background: reason ? fill.accent : T.border, color: fill.onAccent, fontFamily: T.font, fontWeight: 600, fontSize: 13.5, cursor: reason ? "pointer" : "default" }}
        >
          {state === "sending" ? t("reportQuestion.sending") : t("reportQuestion.send")}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null); setState("idle"); }}
          style={{ minHeight: 44, padding: "0 14px", border: `1px solid ${T.border}`, borderRadius: 8, background: "transparent", color: T.text, fontFamily: T.font, fontSize: 13.5, cursor: "pointer" }}
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
