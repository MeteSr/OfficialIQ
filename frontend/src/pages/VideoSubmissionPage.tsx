import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { contentService, type VideoSubmission } from "../services/content";

function statusLabel(s: VideoSubmission["status"], t: TFunction): string {
  if ("Approved" in s) return t("videoSubmission.statusApproved");
  if ("Rejected" in s) return t("videoSubmission.statusRejected");
  return t("videoSubmission.statusPending");
}
function statusColor(s: VideoSubmission["status"]): string {
  if ("Approved" in s) return T.correct;
  if ("Rejected" in s) return T.muted;
  return "#D9A400";
}

export default function VideoSubmissionPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  const [citation, setCitation] = useState("");
  const [clipUrl,  setClipUrl]  = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);
  const [mine,     setMine]     = useState<VideoSubmission[]>([]);

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
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t("videoSubmission.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          {t("sharedReports.goToSignIn")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🎬</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{t("videoSubmission.title")}</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {t("videoSubmission.subtitle")}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 16 }}>
          {t("videoSubmission.disclaimer")}
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{t("videoSubmission.citationLabel")}</div>
        <input
          value={citation}
          onChange={e => setCitation(e.target.value)}
          placeholder={t("videoSubmission.citationPlaceholder")}
          style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, marginBottom: 12, boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{t("videoSubmission.urlLabel")}</div>
        <input
          value={clipUrl}
          onChange={e => setClipUrl(e.target.value)}
          placeholder="https://..."
          style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, marginBottom: 16, boxSizing: "border-box" }}
        />

        {error && <div style={{ color: T.wrong, fontSize: 12, marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ color: T.correct, fontSize: 12, marginBottom: 12 }}>{t("videoSubmission.submitSuccess")}</div>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !citation.trim() || !clipUrl.trim()}
          style={{
            width: "100%", padding: "13px 0",
            background: submitting || !citation.trim() || !clipUrl.trim() ? T.border : T.red,
            color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700, marginBottom: 24,
          }}
        >
          {submitting ? t("videoSubmission.submitting") : t("videoSubmission.submitClip")}
        </button>

        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{t("videoSubmission.yourSubmissions")}</div>
        {mine.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted }}>{t("videoSubmission.noSubmissions")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mine.map((s) => (
              <div key={s.id} style={{ padding: "10px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.citation}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2, wordBreak: "break-all" }}>{s.clipUrl}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: statusColor(s.status), marginTop: 4 }}>
                  {statusLabel(s.status, t)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
