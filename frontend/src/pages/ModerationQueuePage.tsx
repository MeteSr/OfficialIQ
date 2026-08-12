import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { contentService, type VideoSubmission, type CasebookPlay } from "../services/content";

export default function ModerationQueuePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin,       setIsAdmin]       = useState(false);
  const [pending,       setPending]       = useState<VideoSubmission[]>([]);
  const [plays,         setPlays]         = useState<CasebookPlay[]>([]);
  const [selectedPlay,  setSelectedPlay]  = useState<Record<string, string>>({});
  const [busyId,        setBusyId]        = useState<string | null>(null);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { setCheckingAdmin(false); return; }
    contentService.isAdmin().then(setIsAdmin).finally(() => setCheckingAdmin(false));
  }, [isAuthenticated]);

  function load() {
    setLoading(true);
    // Moderators may need to link clips to any sport's plays, not just
    // their own profile's — so this pulls articles across the whole
    // sport registry rather than a single hardcoded sport/level.
    Promise.all([
      contentService.listPendingSubmissions(),
      contentService.listSports(),
    ]).then(async ([subs, sports]) => {
      setPending([...subs].sort((a, b) => Number(a.createdAt - b.createdAt)));
      const articleLists = await Promise.all(
        sports.flatMap(sp => sp.levels.map(lv => contentService.listArticles(sp.id, lv.id))),
      );
      const articles = articleLists.flat();
      const playLists = await Promise.all(articles.map(a => contentService.listPlays(a.id)));
      setPlays(playLists.flat());
    }).finally(() => setLoading(false));
  }

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  async function handleApprove(s: VideoSubmission) {
    const playId = selectedPlay[s.id];
    if (!playId) return;
    setBusyId(s.id);
    try {
      await contentService.approveSubmission(s.id, playId);
      setPending(p => p.filter(x => x.id !== s.id));
    } catch {
      // leave it in the queue; admin can retry
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(s: VideoSubmission) {
    setBusyId(s.id);
    try {
      await contentService.rejectSubmission(s.id);
      setPending(p => p.filter(x => x.id !== s.id));
    } catch {
      // leave it in the queue; admin can retry
    } finally {
      setBusyId(null);
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t("moderation.signInRequired")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          {t("sharedReports.goToSignIn")}
        </button>
      </div>
    );
  }

  if (checkingAdmin) {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{t("moderation.adminsOnly")}</div>
        <button onClick={() => navigate("/home")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          {t("addFriend.backToHome")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🗂️</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{t("moderation.title")}</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {t("moderation.pendingCount", { count: pending.length })}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: "center", color: T.muted }}>{t("common.loading")}</div>
        ) : pending.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted, textAlign: "center" }}>{t("moderation.nothingPending")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pending.map((s) => (
              <div key={s.id} style={{ padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{s.citation}</div>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 10, wordBreak: "break-all" }}>{s.clipUrl}</div>

                <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{t("moderation.linkToPlay")}</div>
                <select
                  value={selectedPlay[s.id] ?? ""}
                  onChange={e => setSelectedPlay(m => ({ ...m, [s.id]: e.target.value }))}
                  style={{ width: "100%", padding: "9px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.bg, color: T.text, marginBottom: 10 }}
                >
                  <option value="">{t("moderation.selectPlay")}</option>
                  {plays.map(p => (
                    <option key={p.id} value={p.id}>{p.citation} — {p.scenario.slice(0, 50)}…</option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleApprove(s)}
                    disabled={busyId === s.id || !selectedPlay[s.id]}
                    style={{
                      flex: 1, padding: "10px 0",
                      background: !selectedPlay[s.id] ? T.border : T.correct,
                      color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700,
                    }}
                  >
                    {busyId === s.id ? "…" : t("moderation.approve")}
                  </button>
                  <button
                    onClick={() => handleReject(s)}
                    disabled={busyId === s.id}
                    style={{ flex: 1, padding: "10px 0", background: T.surface, border: `1px solid ${T.wrong}`, color: T.wrong, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
                  >
                    {t("moderation.reject")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
