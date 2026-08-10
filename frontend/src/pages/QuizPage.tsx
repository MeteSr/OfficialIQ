import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { T } from "../tokens";

// Stub questions — replace with question canister call
const STUB_QUESTIONS = [
  {
    id: "q1",
    articleLabel: "Art. 4 – Fouls",
    stem: "A player drives to the basket and is fouled by a defender who has established legal guarding position. The offensive player also charges. This is best described as:",
    choices: [
      { id: "a", text: "Simultaneous foul — both disqualified" },
      { id: "b", text: "Blocking foul — defender penalized" },
      { id: "c", text: "Charge — attacker responsible" },
      { id: "d", text: "Player control foul on offense" },
    ],
    correctId: "b",
    citation: "Art. 4-23, pg. 42",
    explanation: "A defender who has established legal guarding position may not move into the path of the dribbler.",
  },
];

const SECONDS_PER_Q = 45;

export default function QuizPage() {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const questions = STUB_QUESTIONS;
  const total = questions.length;

  const [idx, setIdx]       = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_Q);
  const [done, setDone]     = useState(false);

  const q = questions[idx];
  const revealed = chosen !== null;

  const advance = useCallback(() => {
    if (idx + 1 < total) {
      setIdx(i => i + 1);
      setChosen(null);
      setTimeLeft(SECONDS_PER_Q);
    } else {
      setDone(true);
    }
  }, [idx, total]);

  useEffect(() => {
    if (revealed || done) return;
    if (timeLeft === 0) { setChosen("__timeout__"); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, revealed, done]);

  if (done) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Quiz Complete!</div>
        <button
          onClick={() => navigate("/home")}
          style={{
            marginTop: 24, padding: "13px 32px",
            background: T.navy, color: T.white,
            borderRadius: 8, fontSize: 15, fontWeight: 700,
          }}
        >Back to Home</button>
      </div>
    );
  }

  const timerPct = (timeLeft / SECONDS_PER_Q) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      {/* Header */}
      <div style={{
        background: T.navy, padding: "52px 16px 14px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={() => navigate(-1)} style={{ color: T.white, fontSize: 22, background: "transparent" }}>‹</button>
        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${timerPct}%`, background: T.red, transition: "width 1s linear" }} />
        </div>
        <span style={{ color: T.white, fontSize: 12, minWidth: 36, textAlign: "right" }}>
          {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
        </span>
        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{idx + 1}/{total}</span>
      </div>

      <div style={{ padding: "16px 16px 0", flex: 1 }}>
        <div style={{ fontSize: 12, color: T.red, fontWeight: 600, marginBottom: 8 }}>{q.articleLabel}</div>
        <p style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.5, marginBottom: 20 }}>{q.stem}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.choices.map((c) => {
            let bg = T.surface, border = T.border, color = T.text;
            if (revealed) {
              if (c.id === q.correctId)  { bg = "#E6F4EC"; border = T.correct; color = T.correct; }
              else if (c.id === chosen)  { bg = "#FDECEA"; border = T.wrong;   color = T.wrong; }
            } else if (c.id === chosen) {
              border = T.navy;
            }
            return (
              <button
                key={c.id}
                disabled={revealed}
                onClick={() => setChosen(c.id)}
                style={{
                  padding: "13px 16px", background: bg,
                  border: `2px solid ${border}`, borderRadius: 8,
                  textAlign: "left", fontSize: 14, color, fontWeight: 400,
                  display: "flex", gap: 10, alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 18, color: revealed && c.id === q.correctId ? T.correct : T.muted }}>
                  {c.id.toUpperCase()}.
                </span>
                {c.text}
                {revealed && c.id === q.correctId && <span style={{ marginLeft: "auto" }}>✓</span>}
              </button>
            );
          })}
        </div>

        {/* Explanation */}
        {revealed && (
          <div style={{
            marginTop: 16, padding: "12px 14px",
            background: "#E6F4EC", border: `1px solid ${T.correct}`,
            borderRadius: 8, fontSize: 13, color: T.correct,
          }}>
            <strong>Correct</strong> — {q.citation}: {q.explanation}
          </div>
        )}
      </div>

      {/* Next button */}
      <div style={{ padding: 16 }}>
        <button
          disabled={!revealed}
          onClick={advance}
          style={{
            width: "100%", padding: "14px 0",
            background: revealed ? T.navy : T.border,
            color: T.white, borderRadius: 8,
            fontSize: 15, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "background 0.15s",
          }}
        >
          Next Question →
        </button>
      </div>
    </div>
  );
}
