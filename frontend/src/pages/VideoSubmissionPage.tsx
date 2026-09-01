import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { T, fill } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { contentService, type VideoSubmission } from "../services/content";

function statusLabel(s: VideoSubmission["status"], t: TFunction): string {
  if ("Approved" in s) return t("videoSubmission.statusApproved");
  if ("Rejected" in s) return t("videoSubmission.statusRejected");
  return t("videoSubmission.statusPending");
}
function statusColor(s: VideoSubmission["status"]): string {
  if ("Approved" in s) return fill.accent;
  if ("Rejected" in s) return "rgba(255,255,255,0.2)";
  return fill.attention;
}

export default function VideoSubmissionPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  const [citation,   setCitation]   = useState("");
  const [clipUrl,    setClipUrl]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState(false);
  const [mine,       setMine]       = useState<VideoSubmission[]>([]);

  function loadMine() {
    contentService.getMySubmissions().then((s) => {
      setMine([...s].sort((a, b) => Number(b.createdAt - a.createdAt)));
    }).catch(() => {});
  }

  useEffect(() => { if (isAuthenticated) loadMine(); }, [isAuthenticated]);

  async function handleSubmit() {
    if (!citation.trim() || !clipUrl.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await contentService.submitVideoClip(citation.trim(), clipUrl.trim());
      setCitation("");
      setClipUrl("");
      setSuccess(true);
      loadMine();
    } catch (e: any) {
      setError(e.message ?? t("videoSubmission.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: T.text }}>{t("videoSubmission.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, cursor: "pointer" }}>
          {t("sharedReports.goToSignIn")}
        </button>
      </div>
    );
  }

  const canSubmit = !submitting && citation.trim().length > 0 && clipUrl.trim().length > 0;

  return (
    <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font, display: "flex", flexDirection: "column", paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: T.panelAlt, padding: "56px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text, lineHeight: 1.05 }}>
          {t("videoSubmission.title")}
        </div>
        <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, color: T.muted, marginTop: 5 }}>
          {t("videoSubmission.subtitle")}
        </div>
      </div>

      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontFamily: T.font, fontSize: 12.5, lineHeight: 1.6, color: "rgba(243,244,241,0.5)" }}>
          {t("videoSubmission.disclaimer")}
        </p>

        {/* Citation field */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: T.faint }}>
            {t("videoSubmission.citationLabel").toUpperCase()}
          </div>
          <input
            value={citation}
            onChange={e => setCitation(e.target.value)}
            placeholder={t("videoSubmission.citationPlaceholder")}
            style={{
              minHeight: 48, padding: "0 14px",
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
              color: T.text, fontFamily: T.font, fontSize: 14,
            }}
          />
        </div>

        {/* URL field */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: T.faint }}>
            {t("videoSubmission.urlLabel").toUpperCase()}
          </div>
          <input
            value={clipUrl}
            onChange={e => setClipUrl(e.target.value)}
            placeholder="https://"
            style={{
              minHeight: 48, padding: "0 14px",
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
              color: T.text, fontFamily: T.font, fontSize: 14,
            }}
          />
        </div>

        {error && (
          <div style={{ fontFamily: T.font, fontSize: 12, color: fill.wrong }}>{error}</div>
        )}
        {success && (
          <div style={{ fontFamily: T.font, fontSize: 12, color: fill.accent }}>{t("videoSubmission.submitSuccess")}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: "100%", minHeight: 50,
            background: canSubmit ? fill.accent : T.border,
            color: fill.onAccent, border: 0, borderRadius: 8,
            fontFamily: T.font, fontSize: 15, fontWeight: 600,
            cursor: canSubmit ? "pointer" : "default",
          }}
        >
          {submitting ? t("videoSubmission.submitting") : t("videoSubmission.submitClip")}
        </button>

        {/* Submission history */}
        {mine.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
              {t("videoSubmission.yourSubmissions")}
            </div>
            {mine.map((s) => {
              const color = statusColor(s.status);
              return (
                <div key={s.id} style={{
                  padding: "12px 14px", background: T.surface,
                  border: `1px solid ${T.border}`, borderLeft: `3px solid ${color}`, borderRadius: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontFamily: T.font, fontWeight: 600, fontSize: 13.5, color: T.text }}>{s.citation}</span>
                    <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.09em", color, flexShrink: 0 }}>
                      {statusLabel(s.status, t)}
                    </span>
                  </div>
                  <div style={{ fontFamily: T.font, fontSize: 11.5, lineHeight: 1.4, color: T.faint, marginTop: 5, wordBreak: "break-all" }}>
                    {s.clipUrl}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {mine.length === 0 && (
          <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted }}>{t("videoSubmission.noSubmissions")}</div>
        )}
      </div>
    </div>
  );
}
