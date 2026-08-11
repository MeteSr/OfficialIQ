import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";
import { userService, type LinkedAccount, type UpcomingGame } from "../services/user";
import { contentService, type CasebookPlay } from "../services/content";

const CURRENT_SEASON = "2025-26";
const PROVIDERS = ["ArbiterSports", "RefTown"];

// gameDate comes back from the canister in nanoseconds (matches Time.now()
// throughout this app), not the JS-native milliseconds.
function formatDate(gameDateNs: number): string {
  return new Date(gameDateNs / 1e6).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
  const { isAuthenticated } = useAuthStore();
  const { sportId, levelId } = useSport();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [games, setGames] = useState<UpcomingGame[]>([]);
  const [recommendedPlays, setRecommendedPlays] = useState<CasebookPlay[]>([]);
  const [recommendSource, setRecommendSource] = useState("");

  const [linkInputs, setLinkInputs] = useState<Record<string, string>>({});
  const [opponent, setOpponent] = useState("");
  const [gameDate, setGameDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    load();
  }, [isAuthenticated, sportId, levelId]);

  async function load() {
    setLoading(true);
    try {
      const [acc, gm] = await Promise.all([userService.getMyLinkedAccounts(), userService.getMyUpcomingGames()]);
      setAccounts(acc);
      setGames(gm);

      const poes = await contentService.listPointsOfEmphasis(CURRENT_SEASON).catch(() => []);
      const linkedArticle = poes.flatMap(p => p.linkedArticleIds)[0];
      if (linkedArticle) {
        const plays = await contentService.listPlays(linkedArticle).catch(() => []);
        setRecommendedPlays(plays.slice(0, 3));
        setRecommendSource(`this season's points of emphasis`);
      } else {
        const progress = await userService.getMyProgress().catch(() => []);
        const studied = progress.filter(p => Number(p.timesStudied) > 0);
        const weakest = [...studied].sort((a, b) => Number(a.masteryScore) - Number(b.masteryScore))[0];
        if (weakest) {
          const plays = await contentService.listPlays(weakest.articleId).catch(() => []);
          setRecommendedPlays(plays.slice(0, 3));
          setRecommendSource("your weakest article");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Sign in to manage your schedule</div>
        <button onClick={() => navigate("/me")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          Go to Profile
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
      const ms = new Date(gameDate).getTime();
      await userService.addUpcomingGame({ opponent: opponent.trim(), gameDate: ms, sportId, levelId, notes: notes.trim() });
      setOpponent(""); setGameDate(""); setNotes("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveGame(id: string) {
    await userService.removeUpcomingGame(id);
    load();
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ background: T.navy, padding: "52px 20px 16px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>📅 My Schedule</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          Linked accounts and upcoming games.
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: T.muted }}>Loading…</div>
      ) : (
        <div style={{ padding: 16 }}>
          {/* Linked accounts */}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Assigning Platform Accounts</div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
            ID-based linking only — ArbiterSports/RefTown don't offer a public API yet, so nothing syncs automatically.
          </div>
          {PROVIDERS.map(provider => {
            const linked = accounts.find(a => a.provider === provider);
            return (
              <div key={provider} style={{ padding: "10px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{provider}</div>
                {linked ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.muted }}>Linked: {linked.externalId}</span>
                    <button onClick={() => handleUnlink(provider)} style={{ padding: "6px 12px", background: T.bg, borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
                      Unlink
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={linkInputs[provider] ?? ""}
                      onChange={e => setLinkInputs(v => ({ ...v, [provider]: e.target.value }))}
                      placeholder={`Your ${provider} account ID`}
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}
                    />
                    <button onClick={() => handleLink(provider)} style={{ padding: "8px 14px", background: T.navy, color: T.white, borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                      Link
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Upcoming games */}
          <div style={{ fontSize: 13, fontWeight: 700, margin: "20px 0 8px" }}>Upcoming Games</div>
          {games.length === 0 && (
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>No upcoming games — add one below.</div>
          )}
          {games.map(g => (
            <div key={g.id} style={{ padding: 14, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{g.opponent}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{formatDate(Number(g.gameDate))}</div>
                  {g.notes && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{g.notes}</div>}
                </div>
                <button onClick={() => handleRemoveGame(g.id)} style={{ padding: "4px 10px", background: T.bg, borderRadius: 6, fontSize: 11, color: T.muted }}>
                  Remove
                </button>
              </div>
              {recommendedPlays.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6 }}>
                    RECOMMENDED REVIEW — from {recommendSource}
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

          {/* Add game form */}
          <div style={{ padding: 14, background: T.bg, borderRadius: 10, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Add a Game</div>
            <input
              value={opponent}
              onChange={e => setOpponent(e.target.value)}
              placeholder="Opponent / matchup"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 8 }}
            />
            <input
              type="date"
              value={gameDate}
              onChange={e => setGameDate(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 8 }}
            />
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 10 }}
            />
            <button
              onClick={handleAddGame}
              disabled={saving || !opponent.trim() || !gameDate}
              style={{ width: "100%", padding: "12px", background: T.red, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700, opacity: (saving || !opponent.trim() || !gameDate) ? 0.5 : 1 }}
            >
              {saving ? "Adding…" : "Add Game"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
