import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { mentorshipService, type MentorLink, type Annotation } from "../services/mentorship";

function fmtDate(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleDateString();
}

export default function MentorPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  const [myShares,    setMyShares]    = useState<MentorLink[]>([]);
  const [dashboard,   setDashboard]   = useState<MentorLink[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      mentorshipService.getMyMentorLinks(),
      mentorshipService.getMentorDashboard(),
      mentorshipService.getMyAnnotations(),
    ]).then(async ([shares, board, notes]) => {
      setMyShares([...shares].sort((a, b) => Number(b.createdAt - a.createdAt)));
      setDashboard([...board].sort((a, b) => Number(b.createdAt - a.createdAt)));
      setAnnotations(notes);
      // Viewing this page acknowledges any pending mentor notes.
      await Promise.all(notes.filter(n => !n.seen).map(n => mentorshipService.markAnnotationSeen(n.id)));
    }).finally(() => setLoading(false));
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t("mentor.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          {t("sharedReports.goToSignIn")}
        </button>
      </div>
    );
  }

  const notesByLink = new Map<string, Annotation[]>();
  annotations.forEach((n) => {
    notesByLink.set(n.linkId, [...(notesByLink.get(n.linkId) ?? []), n]);
  });

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🧑‍🏫</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{t("mentor.title")}</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {t("mentor.subtitle")}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: T.muted }}>{t("common.loading")}</div>
      ) : (
        <div style={{ padding: 16 }}>
          {/* Reports shared with me (mentor role) */}
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
            {t("mentor.sharedWithMe")}
          </div>
          {dashboard.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              {t("mentor.noneSharedWithYou")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {dashboard.map((l) => (
                <button
                  key={l.id}
                  onClick={() => navigate(`/mentor/${l.token}`)}
                  style={{
                    padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: 8, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {Number(l.score)}% · {t("mentor.questionCount", { count: l.answers.length })}
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{t("mentor.sharedOn", { date: fmtDate(l.createdAt) })}</div>
                  </div>
                  <span style={{ color: T.muted }}>›</span>
                </button>
              ))}
            </div>
          )}

          {/* Reports I've shared (mentee role) */}
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
            {t("mentor.iveShared")}
          </div>
          {myShares.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted }}>
              {t("mentor.noneSharedYet")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {myShares.map((l) => {
                const notes = notesByLink.get(l.id) ?? [];
                const claimed = l.mentorPrincipal.length > 0;
                const expired = Number(l.expiresAt) < Date.now() * 1_000_000;
                return (
                  <button
                    key={l.id}
                    onClick={() => navigate(`/mentor/${l.token}`)}
                    style={{
                      padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`,
                      borderRadius: 8, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between",
                      opacity: l.revoked || expired ? 0.5 : 1,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {Number(l.score)}% · {t("mentor.questionCount", { count: l.answers.length })}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                        {l.revoked ? t("mentor.statusRevoked") : expired ? t("mentor.statusExpired") : claimed ? t("mentor.statusClaimed") : t("mentor.statusAwaiting")}
                        {notes.length > 0 && ` · ${t("mentor.noteCount", { count: notes.length })}`}
                      </div>
                    </div>
                    <span style={{ color: T.muted }}>›</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
