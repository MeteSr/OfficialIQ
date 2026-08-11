import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";
import { examService, type ExamSession, DEFAULT_CERT_TEMPLATE } from "../services/exam";
import { rankingService } from "../services/ranking";
import { userService, type ArticleProgress } from "../services/user";
import { contentService, type Article } from "../services/content";
import { computeReadiness, type Readiness } from "../lib/readiness";

const TIME_BUCKETS = [
  { label: "Early Morning (5–8am)", start: 5, end: 8 },
  { label: "Morning (8am–12pm)", start: 8, end: 12 },
  { label: "Afternoon (12–5pm)", start: 12, end: 17 },
  { label: "Evening (5–9pm)", start: 17, end: 21 },
  { label: "Night (9pm–5am)", start: 21, end: 29 }, // wraps past midnight
];

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

function readinessColor(label: Readiness["label"]): string {
  if (label === "On Track") return T.correct;
  if (label === "Borderline") return "#D9A400";
  if (label === "Needs Work") return T.wrong;
  return T.muted;
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, principal } = useAuthStore();
  const { sportId, levelId } = useSport();

  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamSession[]>([]);
  const [progress, setProgress] = useState<ArticleProgress[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [passThreshold, setPassThreshold] = useState(Number(DEFAULT_CERT_TEMPLATE.passThresholdPct));
  const [percentile, setPercentile] = useState<number | null>(null);
  const [poolSize, setPoolSize] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      examService.getMyExams(),
      userService.getMyProgress(),
      contentService.listArticles(sportId, levelId),
      examService.listExamTemplates(sportId),
      rankingService.getNational(sportId, 2000, "Elo"),
    ]).then(([ex, prog, arts, templates, leaderboard]) => {
      setExams(ex);
      setProgress(prog);
      setArticles(arts);
      if (templates.length > 0) setPassThreshold(Number(templates[0].passThresholdPct));

      if (leaderboard.length > 0 && principal) {
        const idx = leaderboard.findIndex(e => e.principal.toString() === principal);
        if (idx >= 0) {
          setPercentile(Math.round((1 - idx / leaderboard.length) * 100));
          setPoolSize(leaderboard.length);
        }
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [isAuthenticated, sportId, levelId, principal]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Sign in to see your analytics</div>
        <button onClick={() => navigate("/me")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          Go to Profile
        </button>
      </div>
    );
  }
  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>Loading…</div>;
  }

  const scoredExams = exams
    .filter(e => e.score.length > 0 && e.finishedAt.length > 0)
    .sort((a, b) => Number(a.finishedAt[0]) - Number(b.finishedAt[0]));
  const chronoScores = scoredExams.map(e => Number(e.score[0]));
  const readiness = computeReadiness(chronoScores, passThreshold);

  // 12-month accuracy trend
  const now = Date.now();
  const twelveMonthsAgo = now - 365 * 24 * 3600 * 1000;
  const monthlyBuckets: Record<string, number[]> = {};
  for (const e of scoredExams) {
    const ms = Number(e.finishedAt[0]) / 1e6;
    if (ms < twelveMonthsAgo) continue;
    const key = monthKey(ms);
    (monthlyBuckets[key] ??= []).push(Number(e.score[0]));
  }
  const monthKeys = Object.keys(monthlyBuckets).sort();
  const monthlyAverages = monthKeys.map(k => ({
    key: k,
    avg: monthlyBuckets[k].reduce((a, b) => a + b, 0) / monthlyBuckets[k].length,
  }));

  // Time-of-day pattern
  const bucketScores = TIME_BUCKETS.map(b => ({ ...b, scores: [] as number[] }));
  for (const e of scoredExams) {
    const hour = new Date(Number(e.startedAt) / 1e6).getHours();
    const wrapped = hour < 5 ? hour + 24 : hour;
    const bucket = bucketScores.find(b => wrapped >= b.start && wrapped < b.end);
    if (bucket) bucket.scores.push(Number(e.score[0]));
  }
  const bucketAverages = bucketScores
    .map(b => ({ label: b.label, avg: b.scores.length ? b.scores.reduce((a, c) => a + c, 0) / b.scores.length : null, count: b.scores.length }))
    .filter(b => b.count >= 2);
  const bestBucket = bucketAverages.length > 0
    ? bucketAverages.reduce((best, b) => (b.avg! > (best.avg ?? -1) ? b : best), bucketAverages[0])
    : null;

  // Article drill-down
  const studied = progress.filter(p => Number(p.timesStudied) > 0);
  const weakestFirst = [...studied].sort((a, b) => Number(a.masteryScore) - Number(b.masteryScore));

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>📊 Analytics</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          Long-term trends and certification readiness.
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {/* Readiness */}
        <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Predicted Certification Readiness</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: readinessColor(readiness.label) }}>{readiness.score}%</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: readinessColor(readiness.label) }}>{readiness.label}</span>
            {readiness.trend !== 0 && (
              <span style={{ fontSize: 12, color: readiness.trend > 0 ? T.correct : T.wrong }}>
                {readiness.trend > 0 ? "▲" : "▼"} {Math.abs(Math.round(readiness.trend))}pt
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
            Based on your last {Math.min(chronoScores.length, 5)} exam(s), vs a {passThreshold}% pass threshold. Heuristic, not a guarantee.
          </div>
        </div>

        {/* 12-month trend */}
        <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>12-Month Accuracy Trend</div>
          {monthlyAverages.length === 0 ? (
            <div style={{ fontSize: 12, color: T.muted }}>Complete a few exams to see your trend line.</div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90 }}>
              {monthlyAverages.map(m => (
                <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: "100%", maxWidth: 24, height: `${Math.max(4, m.avg * 0.7)}px`,
                    background: m.avg >= passThreshold ? T.correct : T.wrong, borderRadius: 3,
                  }} />
                  <span style={{ fontSize: 9, color: T.muted }}>{monthLabel(m.key)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Time of day */}
        <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Study/Exam Time Pattern</div>
          {bucketAverages.length === 0 ? (
            <div style={{ fontSize: 12, color: T.muted }}>Take a few more exams at different times of day to see a pattern.</div>
          ) : (
            <>
              {bestBucket && (
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                  You perform best in the <strong>{bestBucket.label}</strong> — {Math.round(bestBucket.avg!)}% average.
                </div>
              )}
              {bucketAverages.map(b => (
                <div key={b.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                  <span style={{ color: T.muted }}>{b.label}</span>
                  <span style={{ fontWeight: 700 }}>{Math.round(b.avg!)}%</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Percentile */}
        {percentile !== null && (
          <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Where You Stand</div>
            <div style={{ fontSize: 12 }}>
              You're in the <strong>top {Math.max(1, 100 - percentile)}%</strong> of {poolSize} ranked officials in your sport (by ELO).
            </div>
          </div>
        )}

        {/* Article drill-down */}
        <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Article Drill-Down (weakest first)</div>
          {weakestFirst.length === 0 ? (
            <div style={{ fontSize: 12, color: T.muted }}>No studied articles yet.</div>
          ) : (
            weakestFirst.map(p => {
              const a = articles.find(x => x.id === p.articleId);
              return (
                <button
                  key={p.articleId}
                  onClick={() => navigate(`/quiz/${p.articleId}`)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 12, textAlign: "left" }}
                >
                  <span>Art. {a ? Number(a.number) : "?"}{a ? ` — ${a.title}` : ""}</span>
                  <span style={{ fontWeight: 700, color: Number(p.masteryScore) >= 80 ? T.correct : Number(p.masteryScore) >= 60 ? "#D9A400" : T.wrong }}>
                    {Number(p.masteryScore)}%
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
