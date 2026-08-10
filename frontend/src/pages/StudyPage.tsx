import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { contentService, type Article } from "../services/content";
import { userService, type ArticleProgress } from "../services/user";
import { useAuthStore } from "../store/authStore";

export default function StudyPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [progress, setProgress] = useState<Record<string, ArticleProgress>>({});
  const [overdueIds, setOverdueIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    contentService.listArticles("ncaa_basketball", "varsity")
      .then(async (arts) => {
        const sorted = [...arts].sort((a, b) => Number(a.number) - Number(b.number));
        setArticles(sorted);

        if (!isAuthenticated) return;
        const [myProgress, pace] = await Promise.all([
          userService.getMyProgress().catch(() => []),
          userService.getMyStudyPace().catch(() => null),
        ]);
        setProgress(Object.fromEntries(myProgress.map(p => [p.articleId, p])));
        if (pace) {
          const schedule = await userService.getWeeklySchedule(sorted.map(a => a.id)).catch(() => null);
          if (schedule) setOverdueIds(new Set(schedule.overdue));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  // Overdue articles surface at the top; everything else stays in article order.
  const ordered = [...articles].sort((a, b) => {
    const aOverdue = overdueIds.has(a.id) ? 0 : 1;
    const bOverdue = overdueIds.has(b.id) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    return Number(a.number) - Number(b.number);
  });

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>📖 Study</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          NCAA Men's Basketball
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              height: 64, background: T.border, borderRadius: 10,
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))
        ) : ordered.map((a) => {
          const p = progress[a.id];
          const done = !!p && Number(p.timesStudied) > 0;
          const overdue = overdueIds.has(a.id);
          return (
            <button
              key={a.id}
              onClick={() => navigate(`/quiz/${a.id}`)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px",
                background: T.surface,
                border: `1px solid ${overdue ? T.wrong : T.border}`,
                borderRadius: 10, textAlign: "left",
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: overdue ? "#FDECEA" : done ? "#E6F4EC" : T.navy,
                color: overdue ? T.wrong : done ? T.correct : T.white,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {overdue ? "!" : done ? "✓" : Number(a.number)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  Article {Number(a.number)}
                  {overdue && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.wrong }}>OVERDUE</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{a.title}</div>
                {done && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <div style={{ flex: 1, height: 3, background: T.border, borderRadius: 2, overflow: "hidden", maxWidth: 120 }}>
                      <div style={{
                        height: "100%", width: `${Math.min(100, Number(p.masteryScore))}%`,
                        background: T.correct, borderRadius: 2,
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: T.muted }}>
                      {Number(p.masteryScore)}% mastery · studied {Number(p.timesStudied)}×
                    </span>
                  </div>
                )}
              </div>
              <span style={{ color: T.muted, fontSize: 18 }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
