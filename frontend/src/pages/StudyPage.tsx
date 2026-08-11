import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { contentService, type Article, type PointOfEmphasis } from "../services/content";
import { userService, type ArticleProgress } from "../services/user";
import { questionService } from "../services/question";
import { useAuthStore } from "../store/authStore";
import { saveAudioBlob, deleteAudioBlob, getDownloadedAudioIds } from "../lib/offlineDb";

const CURRENT_SEASON = "2025-26";

export default function StudyPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [progress, setProgress] = useState<Record<string, ArticleProgress>>({});
  const [overdueIds, setOverdueIds] = useState<Set<string>>(new Set());
  const [dueCounts, setDueCounts] = useState<Record<string, number>>({});
  const [poes, setPoes] = useState<PointOfEmphasis[]>([]);
  const [playingPoeId, setPlayingPoeId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    contentService.listPointsOfEmphasis(CURRENT_SEASON).then(setPoes).catch(() => {});
    getDownloadedAudioIds().then(ids => setDownloadedIds(new Set(ids))).catch(() => {});
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); };
  }, []);

  async function handleDownloadToggle(articleId: string, e: MouseEvent) {
    e.stopPropagation();
    if (downloadedIds.has(articleId)) {
      await deleteAudioBlob(articleId);
      setDownloadedIds(s => { const next = new Set(s); next.delete(articleId); return next; });
      return;
    }
    setDownloadingId(articleId);
    try {
      const bytes = await contentService.getArticleAudio(articleId);
      if (bytes) {
        await saveAudioBlob(articleId, bytes);
        setDownloadedIds(s => new Set(s).add(articleId));
      }
    } finally {
      setDownloadingId(null);
    }
  }

  async function togglePoeAudio(poe: PointOfEmphasis) {
    if (playingPoeId === poe.id) {
      audioRef.current?.pause();
      setPlayingPoeId(null);
      return;
    }
    setLoadingAudio(poe.id);
    try {
      const bytes = await contentService.getArticleAudio(poe.id);
      if (!bytes) return;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }));
      objectUrlRef.current = url;
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
        setPlayingPoeId(poe.id);
      }
    } finally {
      setLoadingAudio(null);
    }
  }

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

        const counts = await Promise.all(sorted.map(async (a) => {
          const [rules, casebook] = await Promise.all([
            questionService.getDueCount("ncaa_basketball", [a.id], false),
            questionService.getDueCount("ncaa_basketball", [a.id], true),
          ]);
          return [a.id, rules + casebook] as const;
        }));
        setDueCounts(Object.fromEntries(counts));
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

      <audio ref={audioRef} onEnded={() => setPlayingPoeId(null)} style={{ display: "none" }} />

      {poes.length > 0 && (
        <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>
            POINTS OF EMPHASIS — {CURRENT_SEASON}
          </div>
          {poes.map((poe) => {
            const reviewed = poe.linkedArticleIds.length > 0 &&
              poe.linkedArticleIds.every(id => Number(progress[id]?.timesStudied ?? 0n) > 0);
            const hasAudio = poe.audioUrl.length > 0;
            const isPlaying = playingPoeId === poe.id;
            return (
              <div
                key={poe.id}
                style={{
                  padding: "14px 16px", background: T.surface,
                  border: `1px solid ${reviewed ? T.correct : T.navy}`,
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: T.white, background: T.navy,
                    borderRadius: 6, padding: "2px 6px",
                  }}>
                    POE
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{poe.title}</span>
                  {reviewed && <span style={{ fontSize: 11, fontWeight: 700, color: T.correct }}>✓ Reviewed</span>}
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>{poe.body}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {poe.linkedArticleIds.map((id) => {
                      const a = articles.find(x => x.id === id);
                      return (
                        <button
                          key={id}
                          onClick={() => navigate(`/quiz/${id}?adaptive=1`)}
                          style={{
                            padding: "4px 8px", background: T.bg,
                            border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11,
                          }}
                        >
                          {a ? `Art. ${Number(a.number)}` : id}
                        </button>
                      );
                    })}
                  </div>
                  {hasAudio && (
                    <button
                      onClick={() => togglePoeAudio(poe)}
                      style={{
                        width: 30, height: 30, borderRadius: "50%", background: T.navy, color: T.white,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0,
                      }}
                    >
                      {loadingAudio === poe.id ? "…" : isPlaying ? "❚❚" : "▶"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          const due = dueCounts[a.id] ?? 0;
          const hasAudio = a.audioUrl.length > 0;
          const downloaded = downloadedIds.has(a.id);
          const downloading = downloadingId === a.id;
          return (
            <div
              key={a.id}
              onClick={() => navigate(`/quiz/${a.id}?adaptive=1`)}
              role="button"
              tabIndex={0}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px",
                background: T.surface,
                border: `1px solid ${overdue ? T.wrong : T.border}`,
                borderRadius: 10, textAlign: "left", cursor: "pointer",
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
                {due > 0 && (
                  <div style={{ fontSize: 11, color: T.navy, fontWeight: 600, marginTop: 4 }}>
                    📌 Due today: {due} question{due === 1 ? "" : "s"}
                  </div>
                )}
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
              {hasAudio && (
                <button
                  onClick={(e) => handleDownloadToggle(a.id, e)}
                  title={downloaded ? "Remove downloaded audio" : "Download audio for offline listening"}
                  style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: downloaded ? "#E6F4EC" : T.bg,
                    color: downloaded ? T.correct : T.muted,
                    border: `1px solid ${downloaded ? T.correct : T.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                  }}
                >
                  {downloading ? "…" : downloaded ? "✓" : "⬇"}
                </button>
              )}
              <span style={{ color: T.muted, fontSize: 18 }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
