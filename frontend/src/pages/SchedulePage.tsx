import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LoadError from "../components/LoadError";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";
import { userService, type LinkedAccount, type UpcomingGame } from "../services/user";
import { contentService, type CasebookPlay } from "../services/content";
import { challengeService, type Crew } from "../services/challenge";
import { gameTimeMs } from "../lib/gameDay";
import { currentSeason } from "../lib/ruleChanges";
import { createCrewForGame, crewForGame } from "../lib/crew";

const PROVIDERS = ["ArbiterSports", "RefTown"];

// gameDate comes back from the canister in nanoseconds (matches Time.now()
// throughout this app), not the JS-native milliseconds.
function formatDate(gameDateNs: bigint): string {
  return new Date(gameTimeMs(gameDateNs)).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ArbiterSports/RefTown have no public API as of this writing (partnership
// required — see the filed follow-up issue), so linking is ID-based only:
// nothing is verified or synced. Recommended plays likewise aren't scouted
// to the specific opponent — they're drawn from this season's points of
// emphasis (falling back to the official's weakest article), which is the
// most relevant "review this before Saturday" content this app can honestly
// offer without a real schedule/scouting feed.
export default function SchedulePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { sportId, levelId } = useSport();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [games, setGames] = useState<UpcomingGame[]>([]);
  const [recentGames, setRecentGames] = useState<UpcomingGame[]>([]);
  const [recommendedPlays, setRecommendedPlays] = useState<CasebookPlay[]>([]);
  const [recommendSource, setRecommendSource] = useState("");

  const [linkInputs, setLinkInputs] = useState<Record<string, string>>({});
  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [crewBusy, setCrewBusy] = useState<string | null>(null);
  const [crewError, setCrewError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    load();
  }, [isAuthenticated, sportId, levelId]);

  const [loadFailed, setLoadFailed] = useState(false);

  async function load() {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [acc, gm] = await Promise.all([userService.getMyLinkedAccounts(), userService.getMyUpcomingGames()]);
      setAccounts(acc);
      setGames(gm);
      userService.getMyRecentGames().then(setRecentGames).catch(() => setRecentGames([]));
      const now = Date.now();
      challengeService.getMyCrews()
        .then(cs => setCrews(cs.filter(c => gameTimeMs(c.expiresAt) > now).sort((a, b) => Number(a.gameDate - b.gameDate))))
        .catch(() => setCrews([]));

      const poes = await contentService.listPointsOfEmphasis(sportId, currentSeason(now)).catch(() => []);
      const linkedArticle = poes.flatMap(p => p.linkedArticleIds)[0];
      if (linkedArticle) {
        const plays = await contentService.listPlays(linkedArticle).catch(() => []);
        setRecommendedPlays(plays.slice(0, 3));
        setRecommendSource(t("schedule.sourcePointsOfEmphasis"));
      } else {
        const progress = await userService.getMyProgress().catch(() => []);
        const studied = progress.filter(p => Number(p.timesStudied) > 0);
        const weakest = [...studied].sort((a, b) => Number(a.masteryScore) - Number(b.masteryScore))[0];
        if (weakest) {
          const plays = await contentService.listPlays(weakest.articleId).catch(() => []);
          setRecommendedPlays(plays.slice(0, 3));
          setRecommendSource(t("schedule.sourceWeakestArticle"));
        }
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{t("schedule.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          {t("addFriend.goToProfile")}
        </button>
      </div>
    );
  }

  async function handleLink(provider: string) {
    const id = (linkInputs[provider] ?? "").trim();
    if (!id) return;
    await userService.linkExternalAccount(provider, id);
    setLinkInputs(v => ({ ...v, [provider]: "" }));
    load();
  }

  async function handleUnlink(provider: string) {
    await userService.unlinkExternalAccount(provider);
    load();
  }

  async function handleAddGame() {
    if (!opponent.trim() || !gameDate) return;
    setSaving(true);
    try {
      // datetime-local is the official's local time, which the refresher
      // push is timed from (two hours before).
      const ms = new Date(gameDate).getTime();
      await userService.addUpcomingGame({ opponent: opponent.trim(), gameDate: ms, sportId, levelId, notes: notes.trim(), hasStartTime: true });
      setOpponent(""); setGameDate(""); setNotes("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function openCrew(g: UpcomingGame) {
    const existing = crewForGame(crews, g);
    if (existing) { navigate(`/crew/${existing.id}`); return; }
    setCrewBusy(g.id);
    setCrewError(null);
    try {
      const crew = await createCrewForGame({ opponent: g.opponent, gameDateMs: gameTimeMs(g.gameDate), sportId: g.sportId || sportId, levelId: g.levelId || levelId });
      navigate(`/crew/${crew.id}`);
    } catch (e: any) {
      setCrewError(e?.message ?? t("common.error"));
    } finally {
      setCrewBusy(null);
    }
  }

  async function handleRemoveGame(id: string) {
    await userService.removeUpcomingGame(id);
    load();
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ background: T.navy, padding: "52px 20px 16px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>📅 {t("schedule.title")}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          {t("schedule.subtitle")}
        </div>
      </div>

      {loadFailed ? (
        <LoadError onRetry={load} />
      ) : loading ? (
        <div style={{ padding: 24, textAlign: "center", color: T.muted }}>{t("common.loading")}</div>
      ) : (
        <div style={{ padding: 16 }}>
          {/* Linked accounts */}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("schedule.assigningPlatformAccounts")}</div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
            {t("schedule.idBasedLinkingDesc")}
          </div>
          {PROVIDERS.map(provider => {
            const linked = accounts.find(a => a.provider === provider);
            return (
              <div key={provider} style={{ padding: "10px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{provider}</div>
                {linked ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.muted }}>{t("schedule.linked", { id: linked.externalId })}</span>
                    <button onClick={() => handleUnlink(provider)} style={{ padding: "6px 12px", background: T.bg, borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                      {t("schedule.unlink")}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={linkInputs[provider] ?? ""}
                      onChange={e => setLinkInputs(v => ({ ...v, [provider]: e.target.value }))}
                      placeholder={t("schedule.accountIdPlaceholder", { provider })}
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                    />
                    <button onClick={() => handleLink(provider)} style={{ padding: "8px 14px", background: T.navy, color: T.white, borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                      {t("schedule.link")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Recent games: log calls (issue #66) */}
          {recentGames.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 4px" }}>{t("callLog.recentGames")}</div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>{t("callLog.logCallsHint")}</div>
              {recentGames.map(g => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{g.opponent}</div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{formatDate(g.gameDate)}</div>
                  </div>
                  <button onClick={() => navigate(`/calls/${g.id}`)} style={{ padding: "9px 14px", background: T.navy, color: T.white, borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                    {t("callLog.logCalls")}
                  </button>
                </div>
              ))}
            </>
          )}

          {/* Upcoming games */}
          <div style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px" }}>{t("schedule.upcomingGames")}</div>
          {games.length === 0 && (
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>{t("schedule.noGames")}</div>
          )}
          {games.map(g => (
            <div key={g.id} style={{ padding: 14, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{g.opponent}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{formatDate(g.gameDate)}</div>
                  {g.notes && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{g.notes}</div>}
                </div>
                <button onClick={() => handleRemoveGame(g.id)} style={{ padding: "4px 10px", background: T.bg, borderRadius: 6, fontSize: 11, color: T.muted }}>
                  {t("schedule.remove")}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => navigate(`/refresher/${g.id}`)} style={{ flex: 1, padding: "9px 0", background: T.red, color: T.white, borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                  {t("schedule.refresher")}
                </button>
                <button onClick={() => openCrew(g)} disabled={crewBusy !== null} style={{ flex: 1, padding: "9px 0", background: T.navy, color: T.white, borderRadius: 6, fontSize: 12, fontWeight: 700, opacity: crewBusy === g.id ? 0.6 : 1 }}>
                  {crewBusy === g.id ? t("schedule.openingCrew") : crewForGame(crews, g) ? t("schedule.openCrew") : t("schedule.crewPregame")}
                </button>
              </div>
              {recommendedPlays.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6 }}>
                    {t("schedule.recommendedReview", { source: recommendSource })}
                  </div>
                  {recommendedPlays.map(p => (
                    <div key={p.id} style={{ fontSize: 12, padding: "4px 0" }}>
                      <span style={{ fontWeight: 700 }}>{p.citation}</span> — {p.scenario.slice(0, 80)}{p.scenario.length > 80 ? "…" : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {crewError && <div role="alert" style={{ fontSize: 12, color: T.wrong, marginBottom: 10 }}>{crewError}</div>}

          {crews.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, margin: "16px 0 8px" }}>{t("schedule.myCrews")}</div>
              {crews.map(c => (
                <button key={c.id} onClick={() => navigate(`/crew/${c.id}`)} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 8, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>{c.gameLabel}</span>
                  <span style={{ color: T.muted }}>{formatDate(c.gameDate)} · {t("schedule.crewCount", { count: c.members.length })}</span>
                </button>
              ))}
            </>
          )}

          {/* Add game form */}
          <div style={{ padding: 14, background: T.bg, borderRadius: 10, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{t("schedule.addGame")}</div>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>{t("schedule.refresherHint")}</div>
            <input
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              placeholder={t("schedule.opponentPlaceholder")}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 8 }}
            />
            <input
              type="datetime-local"
              value={gameDate}
              onChange={e => setGameDate(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 8 }}
            />
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t("schedule.notesPlaceholder")}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 10 }}
            />
            <button
              onClick={handleAddGame}
              disabled={saving || !opponent.trim() || !gameDate}
              style={{ width: "100%", padding: "12px", background: T.red, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700, opacity: (saving || !opponent.trim() || !gameDate) ? 0.5 : 1 }}
            >
              {saving ? t("schedule.addingGame") : t("schedule.addGameButton")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
