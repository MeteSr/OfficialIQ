import { useEffect, useRef, useState } from "react";
import { T } from "../tokens";

const REWIND_SECONDS = 5;

// Casebook video player (issue #21) — plays a clip linked to a CasebookPlay
// before the question is answerable. `onFirstPlaythrough` fires once, the
// first time the clip reaches its end, so the parent can unlock the answer
// choices; replays via "Watch Again" don't re-lock them.
export default function VideoPlayer({
  src, onFirstPlaythrough,
}: {
  src: string;
  onFirstPlaythrough: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasPlayedThrough, setHasPlayedThrough] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    firedRef.current = false;
    setHasPlayedThrough(false);
    setIsPlaying(false);
    setProgress(0);
  }, [src]);

  function handlePlayPause() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); } else { v.pause(); }
  }

  function handleRewind() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, v.currentTime - REWIND_SECONDS);
  }

  function handleMuteToggle() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }

  function handleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }

  function handleEnded() {
    setIsPlaying(false);
    setHasPlayedThrough(true);
    if (!firedRef.current) {
      firedRef.current = true;
      onFirstPlaythrough();
    }
  }

  function handleWatchAgain() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6 }}>
        WATCH THE PLAY
      </div>
      <div ref={containerRef} style={{ position: "relative", background: "#000", borderRadius: 8, overflow: "hidden" }}>
        <video
          ref={videoRef}
          src={src}
          playsInline
          style={{ width: "100%", display: "block", maxHeight: 260, background: "#000" }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={handleEnded}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress((v.currentTime / v.duration) * 100);
          }}
        />

        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          height: 3, background: "rgba(255,255,255,0.25)",
        }}>
          <div style={{ height: "100%", width: `${progress}%`, background: T.red }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={handlePlayPause}
          style={{
            minWidth: 44, minHeight: 44, flex: 1, padding: "0 12px",
            background: T.navy, color: T.white, borderRadius: 8, fontSize: 14, fontWeight: 700,
          }}
        >
          {isPlaying ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button
          onClick={handleRewind}
          title="Rewind 5 seconds"
          style={{ minWidth: 44, minHeight: 44, padding: "0 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 14, fontWeight: 700 }}
        >
          ↺ 5s
        </button>
        <button
          onClick={handleMuteToggle}
          title={isMuted ? "Unmute" : "Mute"}
          style={{ minWidth: 44, minHeight: 44, padding: "0 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 14, fontWeight: 700 }}
        >
          {isMuted ? "🔇" : "🔊"}
        </button>
        <button
          onClick={handleFullscreen}
          title="Fullscreen"
          style={{ minWidth: 44, minHeight: 44, padding: "0 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 14, fontWeight: 700 }}
        >
          ⤢
        </button>
      </div>

      {!hasPlayedThrough && (
        <div style={{ fontSize: 11, color: T.muted, marginTop: 6, textAlign: "center" }}>
          Watch the full clip to unlock the question.
        </div>
      )}
      {hasPlayedThrough && (
        <button
          onClick={handleWatchAgain}
          style={{ width: "100%", minHeight: 44, marginTop: 8, padding: "10px 0", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: T.navy }}
        >
          ↻ Watch Again
        </button>
      )}
    </div>
  );
}
