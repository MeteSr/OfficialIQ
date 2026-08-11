import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { rankingService, type UserStats, type EloSnapshot } from "../services/ranking";
import { userService, type ArticleProgress } from "../services/user";
import { contentService, type Article } from "../services/content";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";

const THIRTY_DAYS_NS = 30n * 24n * 3600n * 1_000_000_000n;

function masteryColor(pct: number): string {
  if (pct >= 80) return T.correct;
  if (pct >= 60) return "#D9A400";
  return T.wrong;
}
function masteryBg(pct: number): string {
  if (pct >= 80) return "#E6F4EC";
  if (pct >= 60) return "#FFF6DC";
  return "#FDECEA";
}

function EloSparkline({ points }: { points: EloSnapshot[] }) {
  if (points.length < 2) {
    return (
      <div style={{ fontSize: 12, color: T.muted, padding: "16px 0", textAlign: "center" }}>
        Complete a few more exams to see your trend line.
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
  const { isAuthenticated } = useAuthStore();
  const { sportId, levelId } = useSport();
  const MECHANICS_ARTICLE_ID = `${sportId}:mechanics`;

  const [loading,  setLoading]  = useState(true);
  const [stats,    setStats]    = useState<UserStats | null>(null);
  const [history,  setHistory]  = useState<EloSnapshot[]>([]);
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      rankingService.getMyStats(),
      rankingService.getMyEloHistory(),
      userService.getMyProgress(),
      contentService.listArticles(sportId, levelId),
    ]).then(([s, h, p, arts]) => {
      setStats(s);
      setHistory(h);
      setProgress(p);
      setArticles([...arts].sort((a, b) => Number(a.number) - Number(b.number)));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [isAuthenticated, sportId, levelId]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Sign in to see your progress</div>
        <button onClick={() => navigate("/me")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          Go to Profile
        </button>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>Loading…</div>;
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
    { label: "Exams Taken",     value: stats ? Number(stats.examCount) : 0 },
    { label: "Avg Accuracy",    value: stats ? `${Math.round(stats.accuracy * 100)}%` : "—" },
    { label: "Current Streak",  value: stats ? Number(stats.streak) : 0 },
    { label: "Best Streak",     value: stats ? Number(stats.bestStreak) : 0 },
  ];

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>📈 Your Progress</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          NCAA Men's Basketball
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {statCards.map(s => (
            <div key={s.label} style={{ padding: "14px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.navy }}>{s.value}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ELO trend */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>ELO Trend (last 30 days)</div>
          <EloSparkline points={recentHistory} />
          {stats && <div style={{ fontSize: 12, color: T.muted, textAlign: "right" }}>Current: {Math.round(stats.elo)}</div>}
        </div>

        {/* Weak areas */}
        {weakest.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Weakest Areas</div>
              <button
                onClick={() => navigate("/ai-drills")}
                style={{ padding: "6px 12px", background: T.navy, color: T.white, borderRadius: 6, fontSize: 11, fontWeight: 700 }}
              >
                🎯 AI Practice
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {weakest.map(p => {
                const a = articles.find(x => x.id === p.articleId);
                const pct = Number(p.masteryScore);
                return (
                  <div key={p.articleId} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    background: masteryBg(pct), border: `1px solid ${masteryColor(pct)}`, borderRadius: 8,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Art. {a ? Number(a.number) : "?"}{a ? ` — ${a.title}` : ""}</div>
                      <div style={{ fontSize: 11, color: masteryColor(pct) }}>{pct}% mastery</div>
                    </div>
                    <button
                      onClick={() => navigate(`/quiz/${p.articleId}?count=10`)}
                      style={{ padding: "7px 14px", background: T.red, color: T.white, borderRadius: 6, fontSize: 12, fontWeight: 700 }}
                    >
                      Drill Now
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mechanics mastery */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Mechanics Mastery</div>
          <button
            onClick={() => navigate("/study")}
            style={{
              width: "100%", padding: "12px 14px", textAlign: "left",
              background: mechanicsMastery !== null ? masteryBg(mechanicsMastery) : T.bg,
              border: `1px solid ${mechanicsMastery !== null ? masteryColor(mechanicsMastery) : T.border}`,
              borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>🏀 Crew Positioning &amp; Coverage</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>2-person and 3-person mechanics</div>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: mechanicsMastery !== null ? masteryColor(mechanicsMastery) : T.muted }}>
              {mechanicsMastery !== null ? `${mechanicsMastery}%` : "—"}
            </span>
          </button>
        </div>

        {/* Mastery grid */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Article Mastery</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
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
                    alignItems: "center", justifyContent: "center",
                    background: pct !== null ? masteryBg(pct) : T.bg,
                    border: `1px solid ${pct !== null ? masteryColor(pct) : T.border}`,
                  }}
                >
                  <span style={{ fontSize: 11, color: T.muted }}>Art {Number(a.number)}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: pct !== null ? masteryColor(pct) : T.muted }}>
                    {pct !== null ? `${pct}%` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
