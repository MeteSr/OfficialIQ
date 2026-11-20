import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { atCall, seekLimit } from "../lib/clips";

type Question = { stem: string; choices: { id: string; text: string }[]; correctId: string; explanation: string };

/**
 * A game clip, and "you make the call": with a call point and question,
 * the clip stops there (and can't be skipped past) until the official
 * answers, then shows the ruling and plays on.
 */
export default function ClipPlayer({ src, callAtSec, question, onAnswer }: {
  src: string;
  callAtSec: number | null;
  question: Question | null;
  onAnswer?: (correct: boolean) => void;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [stopped, setStopped] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const call = question ? callAtSec : null;
  const answered = answer !== null;

  function onTime() {
    const v = video.current;
    if (!v || !atCall(v.currentTime, call, answered)) return;
    v.pause();
    v.currentTime = call!;
    setStopped(true);
  }

  function onSeeking() {
    const v = video.current;
    if (!v) return;
    const limit = seekLimit(v.currentTime, call, answered);
    if (limit !== v.currentTime) v.currentTime = limit;
  }

  function choose(id: string) {
    setAnswer(id);
    onAnswer?.(id === question!.correctId);
  }

  function playOn() {
    setStopped(false);
    void video.current?.play();
  }

  const choice = { minHeight: 44, padding: "0 14px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left" as const };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <video
        ref={video}
        src={src}
        controls
        playsInline
        preload="metadata"
        onTimeUpdate={onTime}
        onSeeking={onSeeking}
        style={{ width: "100%", borderRadius: 10, background: "#000", aspectRatio: "16 / 9" }}
      />
      {question && stopped && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", color: T.faint, textTransform: "uppercase" }}>{t("clips.makeTheCall")}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{question.stem}</div>
          {question.choices.map(c => {
            const picked = answer === c.id;
            const right = answered && c.id === question.correctId;
            return (
              <button
                key={c.id}
                disabled={answered}
                onClick={() => choose(c.id)}
                style={{
                  ...choice,
                  background: right ? fill.accent : picked ? fill.wrong : T.bg,
                  color: right || picked ? fill.onAccent : T.text,
                  border: `1px solid ${right ? fill.accent : picked ? fill.wrong : T.border}`,
                }}
              >
                {c.text}
              </button>
            );
          })}
          {answered && (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, color: answer === question.correctId ? fill.accent : fill.wrong }}>
                {answer === question.correctId ? t("clips.right") : t("clips.wrong")}
              </div>
              <div style={{ fontSize: 14, color: T.text, lineHeight: 1.45 }}>{question.explanation}</div>
              <button onClick={playOn} style={{ ...choice, background: fill.accent, color: fill.onAccent, border: "none", textAlign: "center" }}>
                {t("clips.watchRest")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
