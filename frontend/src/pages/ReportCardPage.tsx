import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { reportService, type ReportSnapshot, type ArticleStat } from "../services/report";
import { rankingService } from "../services/ranking";
import { userService } from "../services/user";
import { contentService } from "../services/content";
import { associationService, type AssociationRec } from "../services/association";
import ReportCardView from "../components/ReportCardView";
import { exportOrPrint } from "../lib/exportPdf";

const MS_PER_MONTH = 30 * 24 * 3600 * 1000;

export default function ReportCardPage() {
  const navigate = useNavigate();
  const { isAuthenticated, profile, principal } = useAuthStore();

  const [current,    setCurrent]    = useState<ReportSnapshot | null>(null);
  const [history,    setHistory]    = useState<ReportSnapshot[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);

  const [publicBusy, setPublicBusy] = useState(false);
  const [associations, setAssociations] = useState<AssociationRec[]>([]);
  const [shareTarget, setShareTarget] = useState("");
  const [sharing,    setSharing]    = useState(false);
  const [shared,     setShared]     = useState(false);

  function loadHistory() {
    reportService.getMyReports().then((rs) => {
      const sorted = [...rs].sort((a, b) => Number(b.generatedAt - a.generatedAt));
      setHistory(sorted);
      if (sorted.length > 0) setCurrent(sorted[0]);
    }).finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    loadHistory();
    associationService.getMyAssociations().then(setAssociations).catch(() => {});
  }, [isAuthenticated]);

  async function handleGenerate() {
    if (!profile || !principal) return;
    setGenerating(true);
    setError(null);
    try {
      const [stats, eloHistory, progress, articles, myProfile] = await Promise.all([
        rankingService.getMyStats(),
        rankingService.getMyEloHistory(),
        userService.getMyProgress(),
        contentService.listArticles(profile.sport, profile.level),
        userService.getMyProfile(),
      ]);

      const titleFor = (articleId: string) => articles.find(a => a.id === articleId)?.title ?? articleId;

      const studied = progress.filter(p => Number(p.timesStudied) > 0 && !p.articleId.includes("mechanics"));
      const sorted = [...studied].sort((a, b) => Number(b.masteryScore) - Number(a.masteryScore));
      const topStrongest: ArticleStat[] = sorted.slice(0, 3).map(p => ({
        articleId: p.articleId, title: titleFor(p.articleId), masteryScore: BigInt(p.masteryScore),
      }));
      const topWeakest: ArticleStat[] = [...sorted].reverse().slice(0, 3).map(p => ({
        articleId: p.articleId, title: titleFor(p.articleId), masteryScore: BigInt(p.masteryScore),
      }));

      let accuracyTrend = "steady";
      if (eloHistory.length >= 2) {
        const first = eloHistory[0].accuracy;
        const last = eloHistory[eloHistory.length - 1].accuracy;
        const diffPct = Math.round((last - first) * 100);
        accuracyTrend = diffPct > 2 ? `+${diffPct}%` : diffPct < -2 ? `${diffPct}%` : "steady";
      }

      const joinedAt = myProfile ? Number(myProfile.createdAt / 1_000_000n) : Date.now();
      const monthsActive = Math.max(1, Math.round((Date.now() - joinedAt) / MS_PER_MONTH));

      // ~45 minutes of focused study per completed session, matching the
      // heuristic already used for study-pace scheduling elsewhere.
      const totalSessions = progress.reduce((sum, p) => sum + Number(p.timesStudied), 0);
      const studyHoursEstimated = Math.round(totalSessions * 0.75);

      const report = await reportService.generateReport({
        displayName: profile.displayName,
        sport: profile.sport,
        state: profile.state,
        monthsActive,
        examsCompleted: stats ? Number(stats.examCount) : 0,
        avgScore: stats ? Math.round(stats.accuracy * 100) : 0,
        accuracyTrend,
        topStrongest,
        topWeakest,
        studyHoursEstimated,
      });
      setCurrent(report);
      setHistory(h => [report, ...h]);
    } catch (e: any) {
      setError(e.message ?? "Couldn't generate your report card — try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleTogglePublic() {
    if (!current) return;
    setPublicBusy(true);
    try {
      const updated = await reportService.setPublic(current.id, !current.isPublic);
      setCurrent(updated);
      setHistory(h => h.map(r => r.id === updated.id ? updated : r));
    } catch {
      // leave state as-is; user can retry
    } finally {
      setPublicBusy(false);
    }
  }

  async function handleShare() {
    if (!current || !shareTarget) return;
    const assoc = associations.find(a => a.id === shareTarget);
    if (!assoc) return;
    setSharing(true);
    setShared(false);
    try {
      await reportService.shareWithCoordinator(current.id, assoc.coordinator);
      setShared(true);
    } catch {
      // leave as-is; user can retry
    } finally {
      setSharing(false);
    }
  }

  function handlePrint() {
    exportOrPrint("OfficialIQ Report Card");
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Sign in to generate a report card.</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .report-card, .report-card * { visibility: visible; }
          .report-card { position: absolute; top: 0; left: 0; width: 100%; border: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Report Card</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          Share your progress with an assignor or coordinator
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: "center", color: T.muted }}>Loading…</div>
        ) : (
          <>
            {current && (
              <div style={{ marginBottom: 16 }}>
                <ReportCardView report={current} />
              </div>
            )}

            {error && <div className="no-print" style={{ color: T.wrong, fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>}

            <div className="no-print">
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={{
                  width: "100%", padding: "13px 0", marginBottom: 10,
                  background: generating ? T.border : T.red, color: T.white,
                  borderRadius: 8, fontSize: 15, fontWeight: 700,
                }}
              >
                {generating ? "Generating…" : current ? "Regenerate Report Card" : "Generate Report Card"}
              </button>

              {current && (
                <>
                  <button
                    onClick={handlePrint}
                    style={{ width: "100%", padding: "12px 0", marginBottom: 10, background: T.navy, color: T.white, borderRadius: 8, fontSize: 14, fontWeight: 700 }}
                  >
                    🖨️ Print / Export PDF
                  </button>

                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 16,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Public Profile</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                        {current.isPublic ? "Anyone with the link can view" : "Only you (and anyone you share it with) can view"}
                      </div>
                    </div>
                    <button
                      onClick={handleTogglePublic}
                      disabled={publicBusy}
                      style={{
                        width: 48, height: 26, borderRadius: 13, flexShrink: 0,
                        background: current.isPublic ? T.navy : T.border, position: "relative",
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 3, left: current.isPublic ? "calc(100% - 23px)" : 3,
                        width: 20, height: 20, borderRadius: "50%", background: T.white, display: "block",
                      }} />
                    </button>
                  </div>

                  {current.isPublic && (
                    <div style={{ marginBottom: 16 }}>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(`${window.location.origin}/report/${current.id}`).catch(() => {});
                        }}
                        style={{ width: "100%", padding: "10px 0", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: T.navy }}
                      >
                        🔗 Copy Public Link
                      </button>
                    </div>
                  )}

                  {associations.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Share with Coordinator</div>
                      <select
                        value={shareTarget}
                        onChange={e => { setShareTarget(e.target.value); setShared(false); }}
                        style={{ width: "100%", padding: "9px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, marginBottom: 8 }}
                      >
                        <option value="">Select an association…</option>
                        {associations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <button
                        onClick={handleShare}
                        disabled={!shareTarget || sharing}
                        style={{ width: "100%", padding: "10px 0", background: !shareTarget ? T.border : T.navy, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
                      >
                        {sharing ? "Sending…" : shared ? "Sent ✓" : "Send to Coordinator"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {history.length > 1 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Past Report Cards</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {history.slice(1).map(r => (
                      <button
                        key={r.id}
                        onClick={() => setCurrent(r)}
                        style={{
                          padding: "9px 12px", background: T.surface, border: `1px solid ${T.border}`,
                          borderRadius: 8, textAlign: "left", fontSize: 12, color: T.muted,
                        }}
                      >
                        {new Date(Number(r.generatedAt / 1_000_000n)).toLocaleDateString()} — {Number(r.avgScore)}% avg
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
