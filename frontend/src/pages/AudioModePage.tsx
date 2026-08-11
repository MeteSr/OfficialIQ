import { useEffect, useRef, useState } from "react";
import { T } from "../tokens";
import { contentService, type Article } from "../services/content";
import { useSport } from "../lib/sport";

const SPEEDS = [0.75, 1, 1.25, 1.5];

export default function AudioModePage() {
  const { sportId, levelId } = useSport();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1); // 1x
  const [progress, setProgress] = useState(0); // 0..1
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    contentService.listArticles(sportId, levelId)
      .then((arts) => setArticles([...arts].sort((a, b) => Number(a.number) - Number(b.number))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sportId, levelId]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const withAudio = articles.filter(a => a.audioUrl.length > 0);
  const current = articles.find(a => a.id === currentId) ?? null;

  async function playArticle(id: string) {
    setError(null);
    setCurrentId(id);
    setLoadingAudio(true);
    setIsPlaying(false);
    setProgress(0);
    try {
      const bytes = await contentService.getArticleAudio(id);
      if (!bytes) throw new Error("No audio available");
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }));
      objectUrlRef.current = url;
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.playbackRate = SPEEDS[speedIdx];
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch {
      setError("Couldn't load audio for this article.");
    } finally {
      setLoadingAudio(false);
    }
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) { el.play(); setIsPlaying(true); }
    else { el.pause(); setIsPlaying(false); }
  }

  function skip(seconds: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + seconds));
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  }

  function handleEnded() {
    setIsPlaying(false);
    if (!currentId) return;
    const idx = withAudio.findIndex(a => a.id === currentId);
    const next = withAudio[idx + 1];
    if (next) playArticle(next.id);
  }

  function handleTimeUpdate() {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    setProgress(el.currentTime / el.duration);
  }

  return (
    <div style={{ paddingBottom: current ? 96 : 16 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>🎧 Audio Mode</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          Listen to rule articles narrated
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {error && (
          <div style={{ fontSize: 12, color: T.wrong, marginBottom: 4 }}>{error}</div>
        )}

        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              height: 64, background: T.border, borderRadius: 10,
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))
        ) : articles.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted, textAlign: "center", padding: 24 }}>
            No articles available yet.
          </div>
        ) : articles.map((a) => {
          const hasAudio = a.audioUrl.length > 0;
          const active = a.id === currentId;
          return (
            <button
              key={a.id}
              onClick={() => hasAudio && playArticle(a.id)}
              disabled={!hasAudio}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px",
                background: active ? "#EEF2FC" : T.surface,
                border: `1px solid ${active ? T.navy : T.border}`,
                borderRadius: 10, textAlign: "left",
                opacity: hasAudio ? 1 : 0.5,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: active ? T.navy : T.bg,
                color: active ? T.white : T.muted,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {active && loadingAudio ? "…" : active && isPlaying ? "▶" : Number(a.number)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Article {Number(a.number)}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                  {hasAudio ? a.title : `${a.title} — no audio yet`}
                </div>
              </div>
              {hasAudio && <span style={{ color: T.muted, fontSize: 16 }}>🔊</span>}
            </button>
          );
        })}
      </div>

      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        style={{ display: "none" }}
      />

      {current && (
        <div style={{
          position: "fixed", bottom: 64, left: 0, right: 0,
          maxWidth: 430, margin: "0 auto",
          background: T.navy, color: T.white,
          padding: "12px 16px 16px",
          borderTop: `1px solid rgba(255,255,255,0.1)`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, opacity: 0.85 }}>
            Article {Number(current.number)} — {current.title}
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ height: "100%", width: `${progress * 100}%`, background: T.red, borderRadius: 2 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <button
              onClick={cycleSpeed}
              style={{ fontSize: 12, fontWeight: 700, color: T.white, background: "rgba(255,255,255,0.12)", borderRadius: 8, padding: "6px 10px" }}
            >
              {SPEEDS[speedIdx]}x
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <button onClick={() => skip(-15)} style={{ color: T.white, fontSize: 18 }}>«15</button>
              <button
                onClick={togglePlay}
                style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: T.red, color: T.white,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                }}
              >
                {loadingAudio ? "…" : isPlaying ? "❚❚" : "▶"}
              </button>
              <button onClick={() => skip(15)} style={{ color: T.white, fontSize: 18 }}>15»</button>
            </div>
            <span style={{ width: 40 }} />
          </div>
        </div>
      )}
    </div>
  );
}
