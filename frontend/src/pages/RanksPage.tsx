import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { rankingService, type LeaderboardEntry, type SortKey } from "../services/ranking";
import { challengeService } from "../services/challenge";
import { questionService } from "../services/question";
import { useAuthStore } from "../store/authStore";

type Tab = "Friends" | "State" | "National";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "Elo",      label: "ELO" },
  { key: "Accuracy", label: "Accuracy" },
  { key: "Speed",    label: "Speed" },
];

export default function RanksPage() {
  const [tab,     setTab]     = useState<Tab>("Friends");
  const [sortBy,  setSortBy]  = useState<SortKey>("Elo");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { principal, profile } = useAuthStore();
  const myState = profile?.state || "TX";
  const navigate = useNavigate();
  const [challenging, setChallenging] = useState(false);

  useEffect(() => {
    setLoading(true);
    const fetch =
      tab === "Friends"  ? rankingService.getFriends("ncaa_basketball", 25, sortBy) :
      tab === "State"    ? rankingService.getState("ncaa_basketball", myState, 25, sortBy) :
                           rankingService.getNational("ncaa_basketball", 25, sortBy);
    fetch.then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, [tab, sortBy, myState]);

  const top = entries[0];

  async function handleChallenge(entry: LeaderboardEntry) {
    setChallenging(true);
    try {
      const articleIds = ["ncaa_basketball:art4"];
      const qs = await questionService.sampleQuiz({
        sportId: "ncaa_basketball", articleIds, casebook: true, difficulty: [], count: 10n,
      });
      if (qs.length === 0) {
        alert("No questions available for this challenge yet.");
        return;
      }
      const challenge = await challengeService.sendChallenge(
        entry.principal, "ncaa_basketball",
        articleIds, qs.map(q => q.id), qs.length,
      );
      navigate(`/challenge/${challenge.id}`);
    } catch (e: any) {
      alert(e.message ?? "Failed to send challenge");
    } finally {
      setChallenging(false);
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

      <div style={{ padding: "12px 16px 0", display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Sort by</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            style={{
              padding: "5px 12px", borderRadius: 12,
              background: sortBy === opt.key ? T.navy : T.surface,
              color: sortBy === opt.key ? T.white : T.text,
              border: `1px solid ${sortBy === opt.key ? T.navy : T.border}`,
              fontSize: 12, fontWeight: sortBy === opt.key ? 700 : 400,
            }}
          >
            {opt.label}
          </button>
        ))}
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
                {sortBy === "Elo" ? Math.round(e.elo)
                  : sortBy === "Speed" ? `${Math.round(e.avgElapsedSec)}s`
                  : `${Math.round(e.accuracy * 100)}%`}
              </span>
            </div>
          );
        })}
      </div>

      {top && !loading && (
        <div style={{ padding: "16px 16px 0" }}>
          <button
            onClick={() => handleChallenge(top)}
            disabled={challenging}
            style={{
              width: "100%", padding: "14px 0",
              background: challenging ? T.border : T.red, color: T.white,
              borderRadius: 8, fontSize: 15, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {challenging ? "Sending…" : `⚡ Challenge ${top.displayName} to a Rematch`}
          </button>
        </div>
      )}
    </div>
  );
}
