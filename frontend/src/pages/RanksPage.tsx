import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { rankingService, type LeaderboardEntry, type SortKey } from "../services/ranking";
import { challengeService } from "../services/challenge";
import { questionService } from "../services/question";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";

type Tab = "Friends" | "State" | "National";

const SORT_OPTIONS: { key: SortKey; labelKey: string }[] = [
  { key: "Elo",      labelKey: "ranks.sortElo" },
  { key: "Accuracy", labelKey: "ranks.sortAccuracy" },
  { key: "Speed",    labelKey: "ranks.sortSpeed" },
];
const TAB_LABEL_KEYS: Record<Tab, string> = {
  Friends: "ranks.tabFriends",
  State: "ranks.tabState",
  National: "ranks.tabNational",
};

export default function RanksPage() {
  const { t } = useTranslation();
  const [tab,     setTab]     = useState<Tab>("Friends");
  const [sortBy,  setSortBy]  = useState<SortKey>("Elo");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { principal, profile } = useAuthStore();
  const { sportId } = useSport();
  const myState = profile?.state || "TX";
  const navigate = useNavigate();
  const [challenging, setChallenging] = useState(false);

  useEffect(() => {
    setLoading(true);
    const fetch =
      tab === "Friends"  ? rankingService.getFriends(sportId, 25, sortBy) :
      tab === "State"    ? rankingService.getState(sportId, myState, 25, sortBy) :
                           rankingService.getNational(sportId, 25, sortBy);
    fetch.then(setEntries).catch(() => {}).finally(() => setLoading(false));
  }, [tab, sortBy, myState, sportId]);

  const top = entries[0];

  async function handleChallenge(entry: LeaderboardEntry) {
    setChallenging(true);
    try {
      const articleIds = [`${sportId}:art4`];
      const qs = await questionService.sampleQuiz({
        sportId, articleIds, casebook: true, difficulty: [], count: 10n,
      });
      if (qs.length === 0) {
        alert(t("ranks.noQuestionsForChallenge"));
        return;
      }
      const challenge = await challengeService.sendChallenge(
        entry.principal, sportId,
        articleIds, qs.map(q => q.id), qs.length,
      );
      navigate(`/challenge/${challenge.id}`);
    } catch (e: any) {
      alert(e.message ?? t("ranks.challengeFailed"));
    } finally {
      setChallenging(false);
    }
  }

  return (
    <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font, display: "flex", flexDirection: "column", paddingBottom: 64 }}>
      {/* Header */}
      <div style={{ background: T.panelAlt, padding: "52px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 16 }}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text, lineHeight: 1.05 }}>
            {t("ranks.title")}
          </div>
          <button
            onClick={() => navigate("/groups")}
            style={{ minHeight: 44, padding: "0 14px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.font, fontWeight: 600, fontSize: 12, cursor: "pointer" }}
          >
            {t("ranks.groups")}
          </button>
        </div>

        {/* Scope tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["Friends", "State", "National"] as Tab[]).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              style={{
                flex: 1, minHeight: 44, background: "transparent", border: 0,
                borderBottom: `2px solid ${tab === tb ? T.text : "transparent"}`,
                color: tab === tb ? T.text : T.faint,
                fontFamily: T.font, fontWeight: tab === tb ? 600 : 400, fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t(TAB_LABEL_KEYS[tb])}
            </button>
          ))}
        </div>
      </div>

      {/* Sort row */}
      <div style={{ padding: "14px 16px 0", display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: T.faint }}>SORT</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            style={{
              minHeight: 36, padding: "0 13px", borderRadius: 18,
              background: sortBy === opt.key ? fill.accent : T.surface,
              color: sortBy === opt.key ? fill.onAccent : T.text,
              border: `1px solid ${sortBy === opt.key ? fill.accent : T.border}`,
              fontFamily: T.font, fontWeight: 600, fontSize: 12, cursor: "pointer",
            }}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>

      {/* Leaderboard rows */}
      <div style={{ flex: 1, padding: "10px 16px 0" }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ height: 56, marginBottom: 1, background: T.border, borderRadius: 4, opacity: 0.4 + i * 0.1 }} />
          ))
        ) : entries.map((e, i) => {
          const isYou = principal && e.principal.toString() === principal;
          const value = sortBy === "Elo" ? String(Math.round(e.elo))
            : sortBy === "Speed" ? `${Math.round(e.avgElapsedSec)}s`
            : `${Math.round(e.accuracy * 100)}%`;
          const streak = Number(e.streak);
          return (
            <div
              key={e.principal.toString()}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "13px 10px",
                borderBottom: `1px solid ${T.hairline}`,
                background: isYou ? "rgba(120,200,150,0.10)" : "transparent",
                borderRadius: isYou ? 8 : 0,
              }}
            >
              <span style={{ width: 22, textAlign: "center", fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 17, color: i < 3 ? T.text : T.faint, lineHeight: 1 }}>
                {Number(e.rank)}
              </span>
              <div style={{
                width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                background: isYou ? fill.accent : T.surface,
                border: `1px solid ${isYou ? fill.accent : T.border}`,
                color: isYou ? fill.onAccent : T.text,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: T.font, fontWeight: 600, fontSize: 14,
              }}>
                {e.displayName[0]?.toUpperCase() ?? "?"}
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: T.font, fontWeight: isYou ? 600 : 500, fontSize: 14, color: T.text, lineHeight: 1.25 }}>
                  {e.displayName}
                </span>
                {streak > 0 && (
                  <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, color: fill.attention }}>
                    {streak}D
                  </span>
                )}
                {isYou && (
                  <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.09em", color: fill.accent }}>
                    YOU
                  </span>
                )}
              </div>
              <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 19, color: isYou ? fill.accent : T.text, lineHeight: 1 }}>
                {value}
              </span>
            </div>
          );
        })}
      </div>

      {top && !loading && (
        <div style={{ padding: 16 }}>
          <button
            onClick={() => handleChallenge(top)}
            disabled={challenging}
            style={{
              width: "100%", minHeight: 50, background: challenging ? T.border : fill.accent,
              color: fill.onAccent, border: 0, borderRadius: 8,
              fontFamily: T.font, fontSize: 15, fontWeight: 600, cursor: challenging ? "default" : "pointer",
            }}
          >
            {challenging ? t("ranks.sending") : t("ranks.challengeToRematch", { name: top.displayName })}
          </button>
        </div>
      )}
    </div>
  );
}
