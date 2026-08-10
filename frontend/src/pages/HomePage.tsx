import { useNavigate } from "react-router-dom";
import { T } from "../tokens";

// Stub data — replace with Zustand store + canister calls
const STATS = { streak: 14, stateRank: 47, accuracy: 84 };
const WEEKLY = { label: "Art. 4–5", done: 3, total: 5 };
const CHALLENGE = { from: "Marcus R.", id: "ch001" };

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: "0 0 16px" }}>
      {/* Header */}
      <div style={{
        background: T.navy, color: T.white,
        padding: "52px 20px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: `2px solid ${T.red}`, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>🛡</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>OfficialIQ</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ background: T.red, borderRadius: 12, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
            🔴 {STATS.streak}
          </span>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: T.muted, display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 13,
          }}>M</div>
        </div>
      </div>

      {/* Stat row */}
      <div style={{ background: T.navy, display: "flex", padding: "0 20px 20px", gap: 0 }}>
        {[
          { value: STATS.streak,    label: "Day Streak", icon: "🔥" },
          { value: `#${STATS.stateRank}`, label: "State Rank",  icon: "📊" },
          { value: `${STATS.accuracy}%`,  label: "Accuracy",    icon: "🎯" },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, textAlign: "center", color: T.white }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.label === "State Rank" ? "#A8C4F5" : T.white }}>
              {s.value}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{s.label}</div>
            <div style={{ fontSize: 16, marginTop: 4 }}>{s.icon}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        {/* Weekly module */}
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 12, padding: "14px 16px", marginBottom: 12,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>This Week — {WEEKLY.label}</span>
            <span style={{ fontSize: 12, color: T.muted }}>{WEEKLY.done}/{WEEKLY.total} done</span>
          </div>
          <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
            <div style={{
              height: "100%", width: `${(WEEKLY.done / WEEKLY.total) * 100}%`,
              background: T.red, borderRadius: 2,
            }} />
          </div>
          <button
            onClick={() => navigate("/quiz/ncaa_basketball:art4")}
            style={{
              width: "100%", padding: "13px 0",
              background: T.red, color: T.white,
              borderRadius: 8, fontSize: 15, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            ▶ Continue Week 4 Study
          </button>
        </div>

        {/* Quick actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[
            { label: "Audio Mode", icon: "🎧" },
            { label: "Quick Drill", icon: "⚡" },
          ].map((a) => (
            <button
              key={a.label}
              style={{
                padding: "14px 0", background: T.surface,
                border: `1px solid ${T.border}`, borderRadius: 10,
                fontSize: 14, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <span style={{ fontSize: 18 }}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>

        {/* Challenge inbox */}
        {CHALLENGE && (
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: "12px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 14 }}>Challenge from <strong>{CHALLENGE.from}</strong></span>
            <button
              onClick={() => navigate("/ranks")}
              style={{
                background: "transparent", color: T.red,
                fontWeight: 700, fontSize: 14,
              }}
            >
              Accept &rsaquo;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
