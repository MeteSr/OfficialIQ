import { useEffect, useState } from "react";
import { T } from "../tokens";
import { rankingService, type LeaderboardEntry } from "../services/ranking";
import { challengeService } from "../services/challenge";
import { useAuthStore } from "../store/authStore";

type Tab = "Friends" | "State" | "National";

export default function RanksPage() {
  const [tab,     setTab]     = useState<Tab>("Friends");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { principal } = useAuthStore();

  useEffect(() => {
    setLoading(true);
    const fetch =
      tab === "Friends"  ? rankingService.getFriends("ncaa_basketball", 25) :
      tab === "State"    ? rankingService.getState("ncaa_basketball", "TX", 25) :
                           rankingService.getNational("ncaa_basketball", 25);
    fetch.then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, [tab]);

  const top = entries[0];

  async function handleChallenge(entry: LeaderboardEntry) {
    try {
      await challengeService.sendChallenge(
        entry.principal, "ncaa_basketball",
        ["ncaa_basketball:art4"], [], 10,
      );
      alert(`Challenge sent to ${entry.displayName}!`);
    } catch (e: any) {
      alert(e.message ?? "Failed to send challenge");
    }
  }

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 0", color: T.white }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 700 }}>
            🏆 Rankings
          </div>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Aug 2025</span>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
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

      <div style={{ padding: "8px 16px" }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              height: 56, marginBottom: 1, background: T.border, borderRadius: 4,
              opacity: 0.4 + i * 0.1,
            }} />
          ))
        ) : entries.map((e) => {
          const isYou = principal && e.principal.toString() === principal;
          return (
            <div
              key={e.principal.toString()}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 10px",
                borderBottom: `1px solid ${T.border}`,
                background: isYou ? "#EEF3FC" : "transparent",
                borderRadius: isYou ? 8 : 0,
              }}
            >
              <span style={{ width: 24, fontSize: 14, color: T.muted, textAlign: "center" }}>
                {Number(e.rank)}
              </span>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: isYou ? T.navy : T.border,
                color: isYou ? T.white : T.text,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {e.displayName[0]?.toUpperCase() ?? "?"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: isYou ? 700 : 500 }}>
                  {e.displayName}
                  {Number(e.streak) > 0 && <span> 🔥 {Number(e.streak)}</span>}
                </div>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: isYou ? T.red : T.text }}>
                {Math.round(e.accuracy * 100)}%
              </span>
            </div>
          );
        })}
      </div>

      {top && !loading && (
        <div style={{ padding: "16px 16px 0" }}>
          <button
            onClick={() => handleChallenge(top)}
            style={{
              width: "100%", padding: "14px 0",
              background: T.red, color: T.white,
              borderRadius: 8, fontSize: 15, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            ⚡ Challenge {top.displayName} to a Rematch
          </button>
        </div>
      )}
    </div>
  );
}
