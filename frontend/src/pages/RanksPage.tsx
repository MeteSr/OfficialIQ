import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
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
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 0", color: T.white }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 700 }}>
            🏆 {t("ranks.title")}
          </div>
          <button
            onClick={() => navigate("/groups")}
            style={{ fontSize: 13, color: T.white, background: "rgba(255,255,255,0.12)", borderRadius: 12, padding: "5px 10px", fontWeight: 600 }}
          >
            👥 {t("ranks.groups")}
          </button>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {(["Friends", "State", "National"] as Tab[]).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              style={{
                flex: 1, padding: "8px 0",
                background: "transparent",
                color: tab === tb ? T.white : "rgba(255,255,255,0.5)",
                fontWeight: tab === tb ? 700 : 400,
                fontSize: 13,
                borderBottom: `2px solid ${tab === tb ? T.white : "transparent"}`,
              }}
            >
              {t(TAB_LABEL_KEYS[tb])}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 16px 0", display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>{t("ranks.sortBy")}</span>
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
            {t(opt.labelKey)}
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
            {challenging ? t("ranks.sending") : `⚡ ${t("ranks.challengeToRematch", { name: top.displayName })}`}
          </button>
        </div>
      )}
    </div>
  );
}
