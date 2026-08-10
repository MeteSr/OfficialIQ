import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";

const ARTICLES = ["Art. 1", "Art. 2", "Art. 3", "Art. 4", "Art. 5"];
const MODES = ["Solo", "Share Link", "Timed"];

export default function ExamPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>(["Art. 1", "Art. 4", "Art. 5"]);
  const [casebook, setCasebook] = useState(true);
  const [count, setCount] = useState(25);
  const [secPerQ, setSecPerQ] = useState(45);
  const [mode, setMode] = useState("Share Link");
  const [generated, setGenerated] = useState(false);

  const toggle = (a: string) => setSelected(s =>
    s.includes(a) ? s.filter(x => x !== a) : [...s, a]
  );

  const estMinutes = Math.round((count * secPerQ) / 60);
  const difficulty = count <= 10 ? "Beginner" : count <= 25 ? "Intermediate" : "Advanced";

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Build Exam</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Customize and generate your exam</div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Article selector */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 10 }}>Rule Articles</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ARTICLES.map((a) => {
              const on = selected.includes(a);
              return (
                <button
                  key={a}
                  onClick={() => toggle(a)}
                  style={{
                    padding: "7px 14px", borderRadius: 6,
                    background: on ? T.navy : T.surface,
                    color: on ? T.white : T.text,
                    border: `1px solid ${on ? T.navy : T.border}`,
                    fontSize: 13, fontWeight: on ? 700 : 400,
                  }}
                >{a}</button>
              );
            })}
            {selected.length < ARTICLES.length && (
              <button
                style={{
                  padding: "7px 14px", borderRadius: 6, background: T.surface,
                  color: T.muted, border: `1px solid ${T.border}`, fontSize: 13,
                }}
              >+ {ARTICLES.length - Math.max(selected.length, 0)} more</button>
            )}
          </div>
        </div>

        {/* Casebook toggle */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14 }}>Include Casebook plays</span>
          <button
            onClick={() => setCasebook(v => !v)}
            style={{
              width: 48, height: 26, borderRadius: 13,
              background: casebook ? T.navy : T.border,
              position: "relative", transition: "background 0.2s",
            }}
          >
            <span style={{
              position: "absolute", top: 3,
              left: casebook ? "calc(100% - 23px)" : 3,
              width: 20, height: 20, borderRadius: "50%",
              background: T.white, transition: "left 0.2s",
              display: "block",
            }} />
          </button>
        </div>

        {/* Count + time */}
        {[
          { label: "Questions",        value: count,    set: setCount,  min: 5,  max: 100, step: 5 },
          { label: "Time per question", value: secPerQ, set: setSecPerQ, min: 15, max: 120, step: 15, suffix: " sec" },
        ].map((row) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14 }}>{row.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => row.set(v => Math.max(row.min, v - row.step))}
                style={{ width: 28, height: 28, borderRadius: 6, background: T.bg, border: `1px solid ${T.border}`, fontSize: 16 }}>−</button>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.red, minWidth: 40, textAlign: "center" }}>
                {row.value}{row.suffix ?? ""}
              </span>
              <button onClick={() => row.set(v => Math.min(row.max, v + row.step))}
                style={{ width: 28, height: 28, borderRadius: 6, background: T.bg, border: `1px solid ${T.border}`, fontSize: 16 }}>+</button>
            </div>
          </div>
        ))}

        {/* Mode selector */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14 }}>Mode</span>
          <select
            value={mode}
            onChange={e => setMode(e.target.value)}
            style={{
              fontSize: 14, fontWeight: 700, color: T.red,
              background: "transparent", border: "none", cursor: "pointer",
            }}
          >
            {MODES.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>

        {/* Difficulty estimate */}
        <div style={{
          padding: "12px 14px", background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 8,
          display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: T.muted,
        }}>
          <span style={{ fontSize: 18 }}>📊</span>
          <span>Est. difficulty: <strong>{difficulty}</strong></span>
          <span style={{ marginLeft: "auto" }}>~ {estMinutes} min exam</span>
        </div>

        {/* Generate */}
        {!generated ? (
          <button
            onClick={() => setGenerated(true)}
            style={{
              width: "100%", padding: "14px 0",
              background: T.navy, color: T.white,
              borderRadius: 8, fontSize: 15, fontWeight: 700,
            }}
          >Generate & Copy Link</button>
        ) : (
          <div style={{
            padding: 20, background: "#EEF3FC",
            border: `1px solid ${T.navy}`, borderRadius: 8,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔗</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Ready to generate!</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>Your exam link will be ready to share or copy.</div>
            <button
              onClick={() => navigate(`/quiz/exam_${Date.now()}`)}
              style={{
                padding: "12px 24px",
                background: T.navy, color: T.white,
                borderRadius: 8, fontSize: 14, fontWeight: 700,
              }}
            >Generate & Copy Link</button>
          </div>
        )}
      </div>
    </div>
  );
}
