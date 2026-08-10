import { useState } from "react";
import { T } from "../tokens";

type Tab = "Friends" | "State" | "National";

const STUB_ENTRIES = [
  { rank: 1, initial: "M", name: "Marcus R.",   score: 96.2, streak: 28, isYou: false },
  { rank: 2, initial: "T", name: "T. Washington", score: 91.7, streak: 0,  isYou: false },
  { rank: 3, initial: "Y", name: "You",           score: 84.2, streak: 14, isYou: true  },
  { rank: 4, initial: "D", name: "D. Okonkwo",   score: 89.1, streak: 0,  isYou: false },
  { rank: 5, initial: "P", name: "P. Sandoval",  score: 87.2, streak: 0,  isYou: false },
];

export default function RanksPage() {
  const [tab, setTab] = useState<Tab>("Friends");

  return (
    <div>
      {/* Header */}
      <div style={{ background: T.navy, padding: "52px 20px 16px", color: T.white }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 700 }}>
            🏆 Rankings
          </div>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Aug 2025</span>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", marginTop: 16, gap: 4 }}>
          {(["Friends", "State", "National"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "8px 0",
                background: "transparent",
                color: tab === t ? T.white : "rgba(255,255,255,0.5)",
                fontWeight: tab === t ? 700 : 400,
                fontSize: 13,
                borderBottom: `2px solid ${tab === t ? T.white : "transparent"}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ padding: "8px 16px" }}>
        {STUB_ENTRIES.map((e) => (
          <div
            key={e.rank}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 0",
              borderBottom: `1px solid ${T.border}`,
              background: e.isYou ? "#EEF3FC" : "transparent",
              borderRadius: e.isYou ? 8 : 0,
              paddingLeft: e.isYou ? 10 : 0,
              marginBottom: e.isYou ? 0 : 0,
            }}
          >
            <span style={{ width: 24, fontSize: 14, color: T.muted, textAlign: "center" }}>{e.rank}</span>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: e.isYou ? T.navy : T.border,
              color: e.isYou ? T.white : T.text,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 14, flexShrink: 0,
            }}>
              {e.initial}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: e.isYou ? 700 : 500 }}>
                {e.name} {e.streak > 0 && <span>🔥 {e.streak}</span>}
              </div>
            </div>
            <span style={{
              fontSize: 15, fontWeight: 700,
              color: e.isYou ? T.red : T.text,
            }}>
              {e.score}%
            </span>
          </div>
        ))}
      </div>

      {/* Challenge CTA */}
      <div style={{ padding: "16px 16px 0" }}>
        <button style={{
          width: "100%", padding: "14px 0",
          background: T.red, color: T.white,
          borderRadius: 8, fontSize: 15, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          ⚡ Challenge Marcus R. to a Rematch
        </button>
      </div>
    </div>
  );
}
