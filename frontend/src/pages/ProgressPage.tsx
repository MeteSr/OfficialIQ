import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { T, fill } from "../tokens";
import { rankingService, type UserStats, type EloSnapshot } from "../services/ranking";
import { userService, type ArticleProgress } from "../services/user";
import { contentService, type Article } from "../services/content";
import { examService, type ExamSession } from "../services/exam";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";

function examModeLabel(mode: ExamSession["config"]["mode"]): string {
  return Object.keys(mode)[0] ?? "Unknown";
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const THIRTY_DAYS_NS = 30n * 24n * 3600n * 1_000_000_000n;

function masteryColor(pct: number): string {
  if (pct >= 80) return fill.accent;
  if (pct >= 60) return fill.attention;
  return fill.wrong;
}
function masteryBorder(pct: number): string {
  const c = masteryColor(pct);
  return c.replace(")", " / 0.45)").replace("oklch(", "oklch(");
}

function EloSparkline({ points, t }: { points: EloSnapshot[]; t: TFunction }) {
  if (points.length < 2) {
    return (
      <div style={{ fontSize: 12, color: T.muted, padding: "16px 0", textAlign: "center" }}>
        {t("progress.trendEmpty")}
      </div>
    );
  }
  const w = 280, h = 60, pad = 4;
  const elos = points.map(p => p.elo);
  const min = Math.min(...elos), max = Math.max(...elos);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (p.elo - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const first = points[0].elo, last = points[points.length - 1].elo;
  const up = last >= first;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={up ? T.correct : T.wrong}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ProgressPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { sportId, levelId } = useSport();
  const MECHANICS_ARTICLE_ID = `${sportId}:mechanics`;

  const [loading,  setLoading]  = useState(true);
  const [stats,    setStats]    = useState<UserStats | null>(null);
  const [history,  setHistory]  = useState<EloSnapshot[]>([]);
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [exams,    setExams]    = useState<ExamSession[]>([]);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      rankingService.getMyStats(),
      rankingService.getMyEloHistory(),
      userService.getMyProgress(),
      contentService.listArticles(sportId, levelId),
      examService.getMyExams(),
    ]).then(([s, h, p, arts, ex]) => {
      setStats(s);
      setHistory(h);
      setProgress(p);
      setArticles([...arts].sort((a, b) => Number(a.number) - Number(b.number)));
      setExams(ex);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [isAuthenticated, sportId, levelId]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: T.text }}>{t("progress.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "13px 32px", background: fill.accent, color: fill.onAccent, borderRadius: 8, fontSize: 15, fontWeight: 700, border: 0, cursor: "pointer" }}>
          {t("addFriend.goToProfile")}
        </button>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80, fontFamily: T.font }}>{t("common.loading")}</div>;
  }

  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const recentHistory = history.filter(h => nowNs - h.timestamp <= THIRTY_DAYS_NS);

  const progressByArticle = Object.fromEntries(progress.map(p => [p.articleId, p]));
  const studied = progress.filter(p => Number(p.timesStudied) > 0 && p.articleId !== MECHANICS_ARTICLE_ID);
  const weakest = [...studied].sort((a, b) => Number(a.masteryScore) - Number(b.masteryScore)).slice(0, 3);
  const mechanicsProgress = progress.find(p => p.articleId === MECHANICS_ARTICLE_ID);
  const mechanicsMastery = mechanicsProgress && Number(mechanicsProgress.timesStudied) > 0
    ? Number(mechanicsProgress.masteryScore) : null;

  const statCards = [
    { label: "EXAMS TAKEN",     value: stats ? Number(stats.examCount) : 0 },
    { label: "AVG ACCURACY",    value: stats ? `${Math.round(stats.accuracy * 100)}%` : "—" },
    { label: "CURRENT STREAK",  value: stats ? Number(stats.streak) : 0 },
    { label: "BEST STREAK",     value: stats ? Number(stats.bestStreak) : 0 },
  ];

  function handleExportCsv() {
    const rows: (string | number)[][] = [
      ["Date", "Sport", "Mode", "Score (%)", "Questions", "Avg Time (sec)"],
      ...exams
        .filter(e => e.score.length > 0)
        .sort((a, b) => Number(a.startedAt) - Number(b.startedAt))
        .map(e => [
          e.finishedAt.length ? new Date(Number(e.finishedAt[0]) / 1e6).toISOString().slice(0, 10) : "",
          e.config.sportId,
          examModeLabel(e.config.mode),
          e.score.length ? Number(e.score[0]) : "",
          e.questionIds.length,
          e.avgElapsedSec.length ? Number(e.avgElapsedSec[0]) : "",
        ]),
    ];
    downloadCsv(`officialiq-exam-history-${Date.now()}.csv`, rows);
  }

  return (
    <div style={{ paddingBottom: 64, background: T.bg, minHeight: "100dvh", fontFamily: T.font }}>
      {/* Header */}
      <div style={{ padding: "52px 20px 18px", background: T.panelAlt, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text, lineHeight: 1.05 }}>
            {t("progress.title")}
          </div>
          <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.09em", color: T.faint, marginTop: 7 }}>
            NCAA MEN'S BASKETBALL · VARSITY
          </div>
        </div>
        {exams.length > 0 && (
          <button
            onClick={handleExportCsv}
            style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 7, padding: "0 12px", minHeight: 44, fontFamily: T.font, fontWeight: 600, fontSize: 11.5, color: T.text, flexShrink: 0, cursor: "pointer" }}
          >
            {t("progress.exportCsv")}
          </button>
        )}
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {statCards.map(s => (
            <div key={s.label} style={{ padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.08em", color: T.faint, marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ELO trend */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "15px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
              {t("progress.eloTrend")} · 30 days
            </div>
            {stats && (
              <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 18, color: fill.accent }}>
                {Math.round(stats.elo)}
              </div>
            )}
          </div>
          <EloSparkline points={recentHistory} t={t} />
        </div>

        {/* Weak areas */}
        {weakest.length > 0 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
              <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
                {t("progress.weakestAreas")}
              </div>
              <button
                onClick={() => navigate("/ai-drills")}
                style={{ padding: "0 12px", minHeight: 44, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontFamily: T.font, fontWeight: 600, fontSize: 11.5, cursor: "pointer" }}
              >
                {t("progress.aiPractice")}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {weakest.map(p => {
                const a = articles.find(x => x.id === p.articleId);
                const pct = Number(p.masteryScore);
                return (
                  <div key={p.articleId} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "13px 16px",
                    background: T.surface, border: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${masteryColor(pct)}`, borderRadius: 10,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: T.text, lineHeight: 1.35 }}>
                        Art. {a ? Number(a.number) : "?"}{a ? ` — ${a.title}` : ""}
                      </div>
                      <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10.5, color: masteryColor(pct), marginTop: 5 }}>
                        {pct}% MASTERY
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/quiz/${p.articleId}?count=10`)}
                      style={{ padding: "0 14px", minHeight: 44, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 6, fontFamily: T.font, fontWeight: 600, fontSize: 12, flexShrink: 0, cursor: "pointer" }}
                    >
                      {t("progress.drillNow")}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mechanics mastery */}
        <button
          onClick={() => navigate("/study")}
          style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderLeft: `3px solid ${mechanicsMastery !== null ? masteryColor(mechanicsMastery) : fill.attention}`,
            borderRadius: 10, padding: "13px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            cursor: "pointer", textAlign: "left",
          }}
        >
          <div>
            <div style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: T.text, lineHeight: 1.3 }}>
              {t("progress.crewPositioning")}
            </div>
            <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 12, color: T.muted, marginTop: 3 }}>
              {t("progress.crewPositioningDesc")}
            </div>
          </div>
          <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 20, color: mechanicsMastery !== null ? masteryColor(mechanicsMastery) : T.muted, flexShrink: 0 }}>
            {mechanicsMastery !== null ? `${mechanicsMastery}%` : "—"}
          </span>
        </button>

        {/* Mastery grid */}
        <div>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint, marginBottom: 12 }}>
            {t("progress.articleMastery")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7 }}>
            {articles.map(a => {
              const p = progressByArticle[a.id];
              const started = !!p && Number(p.timesStudied) > 0;
              const pct = started ? Number(p.masteryScore) : null;
              return (
                <button
                  key={a.id}
                  onClick={() => navigate(`/quiz/${a.id}`)}
                  style={{
                    aspectRatio: "1", borderRadius: 8, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 3,
                    background: pct === null ? T.panel : T.surface,
                    border: `1px solid ${pct === null ? T.hairline : masteryBorder(pct)}`,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 9, color: T.faint }}>A{Number(a.number)}</span>
                  <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 15, color: pct !== null ? masteryColor(pct) : T.faint }}>
                    {pct !== null ? `${pct}%` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 9.5, color: T.faint, marginTop: 12, lineHeight: 1.5 }}>
            GREEN ≥80% · AMBER ≥60% · RED BELOW · DASH NOT STARTED
          </div>
        </div>
      </div>
    </div>
  );
}
