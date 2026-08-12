import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { mentorshipService, type MentorLink, type Annotation } from "../services/mentorship";
import { questionService, type Question } from "../services/question";

export default function MentorReportPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, principal } = useAuthStore();

  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [link,        setLink]        = useState<MentorLink | null>(null);
  const [questions,   setQuestions]   = useState<Record<string, Question>>({});
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draft,       setDraft]       = useState<Record<string, string>>({});
  const [saving,      setSaving]      = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    setLoading(true);
    setError(null);
    mentorshipService.openMentorLink(token)
      .then(async (l) => {
        setLink(l);
        const [qs, notes] = await Promise.all([
          Promise.all(l.answers.map(a => questionService.getQuestion(a.questionId))),
          mentorshipService.getAnnotationsForLink(l.id),
        ]);
        setQuestions(Object.fromEntries(qs.filter((q): q is Question => q !== null).map(q => [q.id, q])));
        setAnnotations(notes);
      })
      .catch((e: any) => setError(e.message ?? t("mentorReport.openFailed")))
      .finally(() => setLoading(false));
  }, [isAuthenticated, token, t]);

  const isOwner  = !!link && !!principal && link.owner.toString() === principal;
  const isMentor = !!link && !!principal && link.mentorPrincipal[0]?.toString() === principal;

  async function handleAnnotate(questionId: string) {
    if (!link) return;
    const note = (draft[questionId] ?? "").trim();
    if (!note) return;
    setSaving(questionId);
    try {
      const a = await mentorshipService.addAnnotation(link.id, questionId, note);
      setAnnotations(prev => [...prev, a]);
      setDraft(d => ({ ...d, [questionId]: "" }));
    } catch {
      // leave the draft in place so the mentor can retry
    } finally {
      setSaving(null);
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t("mentorReport.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          {t("sharedReports.goToSignIn")}
        </button>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("mentorReport.loadingReport")}</div>;
  }

  if (error || !link) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{error ?? t("mentorReport.notFound")}</div>
        <button onClick={() => navigate("/home")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          {t("addFriend.backToHome")}
        </button>
      </div>
    );
  }

  const wrongAnswers = link.answers.filter(a => !a.isCorrect);

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🧑‍🏫</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{t("mentorReport.title")}</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {isOwner ? t("mentorReport.yourResults") : t("mentorReport.menteeResults")}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{
          display: "flex", padding: "16px 0", marginBottom: 16,
          borderBottom: `1px solid ${T.border}`,
        }}>
          {[
            { label: t("mentorReport.statScore"),     value: `${Number(link.score)}%` },
            { label: t("mentorReport.statQuestions"), value: link.answers.length },
            { label: t("mentorReport.statAvgTime"), value: link.avgElapsedSec.length ? `${Number(link.avgElapsedSec[0])}s` : "—" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.navy }}>{s.value}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
          {t("mentorReport.missedQuestions", { count: wrongAnswers.length })}
        </div>

        {wrongAnswers.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>{t("mentorReport.perfectRun")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {wrongAnswers.map((a) => {
              const q = questions[a.questionId];
              const notes = annotations.filter(n => n.questionId === a.questionId);
              return (
                <div key={a.questionId} style={{
                  padding: "12px 14px", background: T.surface,
                  border: `1px solid ${T.border}`, borderRadius: 8,
                }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>
                    {q?.citation ?? a.questionId} · {Number(a.elapsedSec)}s
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>{q?.stem ?? t("mentorReport.questionUnavailable")}</div>
                  <div style={{ fontSize: 12, color: T.wrong, marginBottom: 2 }}>
                    {t("mentorReport.chose", { text: q?.choices.find(c => c.id === a.chosenId)?.text ?? a.chosenId })}
                  </div>
                  <div style={{ fontSize: 12, color: T.correct, marginBottom: 8 }}>
                    {t("mentorReport.correct", { text: q?.choices.find(c => c.id === a.correctId)?.text ?? a.correctId })}
                  </div>

                  {notes.map(n => (
                    <div key={n.id} style={{
                      marginTop: 6, padding: "8px 10px", background: T.bg,
                      borderRadius: 6, fontSize: 12,
                    }}>
                      🗒️ {n.note}
                    </div>
                  ))}

                  {isMentor && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <input
                        value={draft[a.questionId] ?? ""}
                        onChange={e => setDraft(d => ({ ...d, [a.questionId]: e.target.value }))}
                        placeholder={t("mentorReport.notePlaceholder")}
                        style={{
                          flex: 1, padding: "8px 10px", fontSize: 12,
                          border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text,
                        }}
                      />
                      <button
                        onClick={() => handleAnnotate(a.questionId)}
                        disabled={saving === a.questionId || !(draft[a.questionId] ?? "").trim()}
                        style={{ padding: "8px 12px", background: T.navy, color: T.white, borderRadius: 6, fontSize: 12, fontWeight: 700 }}
                      >
                        {saving === a.questionId ? "…" : t("mentorReport.note")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isOwner && (
          <button
            onClick={async () => {
              if (!window.confirm(t("mentorReport.revokeConfirm"))) return;
              await mentorshipService.revokeMentorLink(link.id).catch(() => {});
              navigate("/mentor");
            }}
            style={{ width: "100%", padding: "12px 0", background: T.surface, border: `1px solid ${T.wrong}`, color: T.wrong, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
          >
            {t("mentorReport.revokeLink")}
          </button>
        )}
      </div>
    </div>
  );
}
