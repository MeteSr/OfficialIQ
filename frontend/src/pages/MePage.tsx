import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill, setMode } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useAuth } from "../contexts/AuthContext";
import { rankingService, type UserStats } from "../services/ranking";
import { userService } from "../services/user";
import { challengeService } from "../services/challenge";
import { computeBadges, type Badge } from "../lib/badges";
import { contentService, type Article, type Sport } from "../services/content";
import {
  getStorageBreakdown, getDownloadedAudioIds, deleteAudioBlob, clearAllDownloads,
  type StorageBreakdown,
} from "../lib/offlineDb";
import { Principal } from "@icp-sdk/core/principal";
import { useSport, DEFAULT_SPORT_ID, DEFAULT_LEVEL_ID } from "../lib/sport";
import { syncAllContent } from "../lib/offlineSync";
import { aiProxyService } from "../services/aiProxy";
import { enablePush, disablePush, isPushConfigured, isWebPushSupported } from "../lib/pushNotifications";
import { Capacitor } from "@capacitor/core";

type FriendRow = { principal: string; displayName: string; accuracy: number; streak: bigint };

// Rough heuristic: ~45 minutes of focused study per rule article.
function hoursToArticlesPerWeek(hours: number): number {
  return Math.max(1, Math.round(hours / 0.75));
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`;
}

// Only languages with real, verified UI translations are offered — listing
// a language with no translation file would silently fall back to English
// and look broken. See the filed follow-up issue for French/Portuguese.
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

function ProfileForm({
  initial, sports, onSubmit, submitting, submitLabel, extra,
}: {
  initial: { displayName: string; sport: string; level: string; state: string; preferredLanguage: string };
  sports: Sport[];
  onSubmit: (v: { displayName: string; sport: string; level: string; state: string; preferredLanguage: string }) => void;
  submitting: boolean;
  submitLabel: string;
  extra?: ReactNode;
}) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [sport, setSport] = useState(initial.sport || sports[0]?.id || DEFAULT_SPORT_ID);
  const [level, setLevel] = useState(initial.level || DEFAULT_LEVEL_ID);
  const [state, setState] = useState(initial.state);
  const [preferredLanguage, setPreferredLanguage] = useState(initial.preferredLanguage || "en");
  const { t } = useTranslation();

  const levelsForSport = sports.find(s => s.id === sport)?.levels ?? [{ id: DEFAULT_LEVEL_ID, displayName: "Varsity" }];

  function handleSportChange(newSport: string) {
    setSport(newSport);
    const levels = sports.find(s => s.id === newSport)?.levels ?? [];
    if (levels.length > 0 && !levels.some(l => l.id === level)) setLevel(levels[0].id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{t("me.displayNameLabel")}</div>
        <input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder={t("me.displayNamePlaceholder")}
          style={{
            width: "100%", padding: "10px 12px", fontSize: 14,
            border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text,
          }}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{t("me.sportLabel")}</div>
        <select
          value={sport}
          onChange={e => handleSportChange(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", fontSize: 14,
            border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text,
          }}
        >
          {sports.map(s => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{t("me.levelLabel")}</div>
        <select
          value={level}
          onChange={e => setLevel(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", fontSize: 14,
            border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text,
          }}
        >
          {levelsForSport.map(l => <option key={l.id} value={l.id}>{l.displayName}</option>)}
        </select>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{t("me.stateLabel")}</div>
        <input
          value={state}
          onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))}
          placeholder="TX"
          style={{
            width: "100%", padding: "10px 12px", fontSize: 14,
            border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text,
          }}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>{t("me.languageLabel")}</div>
        <select
          value={preferredLanguage}
          onChange={e => setPreferredLanguage(e.target.value)}
          style={{
            width: "100%", padding: "10px 12px", fontSize: 14,
            border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text,
          }}
        >
          {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>
      {extra}
      <button
        disabled={submitting || !displayName.trim() || state.length !== 2}
        onClick={() => onSubmit({ displayName: displayName.trim(), sport, level, state, preferredLanguage })}
        style={{
          padding: "13px 0", background: submitting ? T.border : fill.accent, color: fill.onAccent,
          border: 0, borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: submitting ? "default" : "pointer",
        }}
      >
        {submitting ? t("me.saving") : submitLabel}
      </button>
    </div>
  );
}

export default function MePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, profile, principal, setProfile } = useAuthStore();
  const { login, logout } = useAuth();
  const { sportId, levelId } = useSport();
  const [stats,      setStats]      = useState<UserStats | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [editing,    setEditing]    = useState(false);
  const [formError,  setFormError]  = useState<string | null>(null);
  const [hoursPerWeek, setHoursPerWeek] = useState(3);
  const [sports,     setSports]     = useState<Sport[]>([]);

  const [friends,        setFriends]        = useState<FriendRow[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [addFriendInput, setAddFriendInput] = useState("");
  const [addFriendError, setAddFriendError] = useState<string | null>(null);
  const [copied,         setCopied]         = useState(false);
  const [badges,         setBadges]         = useState<Badge[]>([]);

  const [storage,           setStorage]           = useState<StorageBreakdown | null>(null);
  const [downloadedArticles, setDownloadedArticles] = useState<Article[]>([]);
  const [clearingStorage,   setClearingStorage]   = useState(false);
  const [isContentAdmin,   setIsContentAdmin]     = useState(false);
  const [isAiAdmin,        setIsAiAdmin]          = useState(false);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy,    setPushBusy]    = useState(false);
  const [pushError,   setPushError]   = useState<string | null>(null);

  useEffect(() => {
    contentService.listSports().then(setSports).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    rankingService.getMyStats().then(setStats).catch(() => {});
    contentService.isAdmin().then(setIsContentAdmin).catch(() => {});
    aiProxyService.isAdmin().then(setIsAiAdmin).catch(() => {});
    isPushConfigured().then(setPushEnabled).catch(() => {});
  }, [isAuthenticated]);

  async function handleTogglePush() {
    setPushBusy(true);
    setPushError(null);
    try {
      if (pushEnabled) {
        await disablePush();
        setPushEnabled(false);
      } else {
        await enablePush();
        setPushEnabled(true);
      }
    } catch (e: any) {
      setPushError(e?.message ?? t("me.pushUpdateFailed"));
    } finally {
      setPushBusy(false);
    }
  }

  function loadStorage() {
    getStorageBreakdown().then(setStorage).catch(() => {});
    Promise.all([getDownloadedAudioIds(), contentService.listArticles(sportId, levelId)])
      .then(([ids, articles]) => {
        const idSet = new Set(ids);
        setDownloadedArticles(articles.filter(a => idSet.has(a.id)).sort((a, b) => Number(a.number) - Number(b.number)));
      })
      .catch(() => {});
  }

  useEffect(loadStorage, [sportId, levelId]);

  async function handleDeleteDownload(articleId: string) {
    await deleteAudioBlob(articleId);
    loadStorage();
  }

  async function handleClearAll() {
    if (!window.confirm(t("me.clearAllConfirm"))) return;
    setClearingStorage(true);
    try {
      await clearAllDownloads();
      loadStorage();
    } finally {
      setClearingStorage(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated || !principal) return;
    Promise.all([
      rankingService.getDailyStreak().catch(() => null),
      rankingService.getSkillCounters().catch(() => null),
      rankingService.getMyStats().catch(() => null),
      userService.getWeeklyQuizHistory().catch(() => []),
      challengeService.getMyChallenges().catch(() => []),
    ]).then(([dailyStreak, skills, myStats, weeklyHistory, challenges]) => {
      setBadges(computeBadges({ dailyStreak, skills, stats: myStats, weeklyHistory, challenges, myPrincipal: principal }));
    });
  }, [isAuthenticated, principal]);

  async function loadFriends() {
    setFriendsLoading(true);
    try {
      const principals = await rankingService.getFriendPrincipals();
      const rows = await Promise.all(principals.map(async (p): Promise<FriendRow> => {
        const [prof, s] = await Promise.all([
          userService.getProfile(p).catch(() => null),
          rankingService.getStats(p).catch(() => null),
        ]);
        return {
          principal:   p.toString(),
          displayName: prof?.displayName ?? t("me.unknownOfficial"),
          accuracy:    s?.accuracy ?? 0,
          streak:      s?.streak ?? 0n,
        };
      }));
      setFriends(rows);
    } catch {
      // leave friends list as-is on failure
    } finally {
      setFriendsLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated && profile) loadFriends();
  }, [isAuthenticated, !!profile]);

  async function handleAddFriend() {
    setAddFriendError(null);
    const raw = addFriendInput.trim();
    if (!raw) return;
    // Accept either a bare principal or a pasted share link (…/u/<principal>)
    const text = raw.includes("/u/") ? raw.split("/u/").pop()!.trim() : raw;
    try {
      const p = Principal.fromText(text);
      await rankingService.addFriend(p);
      setAddFriendInput("");
      await loadFriends();
    } catch (e: any) {
      setAddFriendError(e.message ?? t("me.addFriendFailed"));
    }
  }

  async function handleRemoveFriend(p: string) {
    try {
      await rankingService.removeFriend(Principal.fromText(p));
      setFriends(fs => fs.filter(f => f.principal !== p));
    } catch {
      // ignore — list will self-correct on next load
    }
  }

  async function handleCopyShareLink() {
    if (!principal) return;
    await navigator.clipboard.writeText(`${window.location.origin}/u/${principal}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isAuthenticated) {
    return (
      <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font }}>
        <div style={{ background: T.panelAlt, padding: "52px 20px 20px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text }}>{t("me.profileHeader")}</div>
        </div>
        <div style={{ padding: 24, textAlign: "center", color: T.muted }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: T.text }}>
            {t("me.signInPrompt")}
          </div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>
            {t("me.trackProgress")}
          </div>
          <button
            onClick={async () => { setLoading(true); await login().catch(() => {}); setLoading(false); }}
            disabled={loading}
            style={{
              padding: "13px 32px", background: fill.accent, color: fill.onAccent,
              borderRadius: 8, fontSize: 15, fontWeight: 700, border: 0, cursor: "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? t("me.signingIn") : t("me.signIn")}
          </button>
        </div>
      </div>
    );
  }

  // Signed in but no on-chain profile yet — onboarding.
  if (!profile) {
    return (
      <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font }}>
        <div style={{ background: T.panelAlt, padding: "52px 20px 20px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text }}>{t("me.welcomeTitle")}</div>
          <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted, marginTop: 4 }}>
            {t("me.welcomeSubtitle")}
          </div>
        </div>
        <div style={{ padding: 20 }}>
          {formError && (
            <div style={{ color: T.wrong, fontSize: 13, marginBottom: 12 }}>{formError}</div>
          )}
          <ProfileForm
            initial={{ displayName: "", sport: sports[0]?.id ?? DEFAULT_SPORT_ID, level: DEFAULT_LEVEL_ID, state: "", preferredLanguage: "en" }}
            sports={sports}
            submitting={saving}
            submitLabel={t("me.createProfile")}
            onSubmit={async (v) => {
              setSaving(true);
              setFormError(null);
              try {
                const created = await userService.createProfile(v);
                setProfile(created);
                // Best-effort — a missing pace just means no weekly schedule until
                // the user sets one later; it shouldn't block onboarding.
                await userService.setStudyPace(hoursToArticlesPerWeek(hoursPerWeek)).catch(() => {});
              } catch (e: any) {
                setFormError(e.message ?? t("me.createProfileFailed"));
              } finally {
                setSaving(false);
              }
            }}
            extra={
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>
                  {t("me.hoursPerWeekLabel")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => setHoursPerWeek(h => Math.max(1, h - 1))}
                    style={{ width: 32, height: 32, borderRadius: 6, background: T.bg, border: `1px solid ${T.border}`, fontSize: 16 }}
                  >−</button>
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.red, minWidth: 90, textAlign: "center" }}>
                    {t("me.hoursPerWeek", { count: hoursPerWeek })}
                  </span>
                  <button
                    onClick={() => setHoursPerWeek(h => Math.min(20, h + 1))}
                    style={{ width: 32, height: 32, borderRadius: 6, background: T.bg, border: `1px solid ${T.border}`, fontSize: 16 }}
                  >+</button>
                </div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
                  {t("me.paceHint", { count: hoursToArticlesPerWeek(hoursPerWeek) })}
                </div>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font }}>
        <div style={{ background: T.panelAlt, padding: "52px 20px 20px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text }}>{t("me.editProfileHeader")}</div>
        </div>
        <div style={{ padding: 20 }}>
          {formError && (
            <div style={{ color: T.wrong, fontSize: 13, marginBottom: 12 }}>{formError}</div>
          )}
          <ProfileForm
            initial={{ displayName: profile.displayName, sport: profile.sport, level: profile.level, state: profile.state, preferredLanguage: profile.preferredLanguage || "en" }}
            sports={sports}
            submitting={saving}
            submitLabel={t("me.saveChanges")}
            onSubmit={async (v) => {
              setSaving(true);
              setFormError(null);
              try {
                const switchingSport = v.sport !== profile.sport;
                const updated = await userService.updateProfile(v);
                setProfile(updated);
                setEditing(false);
                if (switchingSport) {
                  // A new sport means the old sport's cached articles/questions
                  // no longer apply — clear and re-sync for the new selection.
                  await clearAllDownloads().catch(() => {});
                  syncAllContent(v.sport, v.level).catch(() => {});
                }
              } catch (e: any) {
                setFormError(e.message ?? t("me.saveProfileFailed"));
              } finally {
                setSaving(false);
              }
            }}
          />
          <button
            onClick={() => setEditing(false)}
            style={{
              width: "100%", padding: "12px 0", marginTop: 10,
              background: "transparent", color: T.muted, fontSize: 14, fontWeight: 600,
            }}
          >
            {t("me.cancel")}
          </button>
        </div>
      </div>
    );
  }

  // Helper for nav link rows
  const NavRow = ({ label, tag, tagColor, path }: { label: string; tag?: string; tagColor?: string; path: string }) => (
    <button
      onClick={() => navigate(path)}
      style={{
        minHeight: 52, padding: "14px 16px", background: T.surface,
        border: `1px solid ${T.border}`, borderRadius: 10,
        display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", width: "100%",
      }}
    >
      <span style={{ flex: 1, fontFamily: T.font, fontWeight: 500, fontSize: 14, color: T.text, lineHeight: 1.3 }}>{label}</span>
      {tag && (
        <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.09em", color: tagColor ?? T.faint }}>{tag}</span>
      )}
      <span style={{ color: T.faint, fontSize: 18 }}>›</span>
    </button>
  );

  return (
    <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font, paddingBottom: 64 }}>
      {/* Header */}
      <div style={{ background: T.panelAlt, padding: "52px 20px 20px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 26, flexShrink: 0,
            background: fill.accent, color: fill.onAccent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: T.font, fontWeight: 600, fontSize: 21,
          }}>
            {profile.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 26, color: T.text, lineHeight: 1.05 }}>
              {profile.displayName}
            </div>
            <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.09em", color: T.faint, marginTop: 6 }}>
              {profile.sport?.toUpperCase().replace(/_/g, " ")} · {profile.level?.toUpperCase()} · {profile.state || "—"}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            style={{ minHeight: 44, padding: "0 14px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.font, fontWeight: 600, fontSize: 12, flexShrink: 0, cursor: "pointer" }}
          >
            {t("me.editProfile")}
          </button>
        </div>

        {/* Stat row — rule-divided */}
        {stats && (
          <div style={{ display: "flex", marginTop: 20, borderTop: `1px solid ${T.hairline}`, paddingTop: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 26, color: T.text, lineHeight: 1 }}>{Number(stats.examCount)}</div>
              <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.08em", color: T.faint, marginTop: 6 }}>EXAMS</div>
            </div>
            <div style={{ flex: 1, borderLeft: `1px solid ${T.hairline}`, paddingLeft: 16 }}>
              <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 26, color: T.text, lineHeight: 1 }}>{Number(stats.streak)}</div>
              <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.08em", color: T.faint, marginTop: 6 }}>STREAK</div>
            </div>
            <div style={{ flex: 1, borderLeft: `1px solid ${T.hairline}`, paddingLeft: 16 }}>
              <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 26, color: fill.accent, lineHeight: 1 }}>{Math.round(stats.accuracy * 100)}%</div>
              <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.08em", color: T.faint, marginTop: 6 }}>ACCURACY</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "18px 16px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Training group */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
            Training
          </div>
          <NavRow label={t("me.viewFullProgress")} path="/progress" />
          <NavRow label={t("me.aiPracticeDrills")} tag="AI" tagColor={fill.accent} path="/ai-drills" />
          {isAiAdmin && <NavRow label={t("me.aiScenarioGenerator")} tag="AI" tagColor={fill.accent} path="/ai-scenarios" />}
          <NavRow label={t("me.askRuleAssistant")} tag="AI" tagColor={fill.accent} path="/ask" />
          <NavRow label={t("me.submitClip")} path="/submit-clip" />
        </div>

        {/* People group */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
            People
          </div>
          <NavRow label={t("me.studyGroups")} path="/groups" />
          <NavRow label={t("me.mentorship")} path="/mentor" />
          <NavRow label={t("me.associations")} path="/association" />
          {isContentAdmin && <NavRow label={t("me.clipModerationQueue")} tag="ADMIN" tagColor={fill.attention} path="/moderation" />}
        </div>

        {/* Records group */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
            Records
          </div>
          <NavRow label={t("me.reportCard")} path="/reports" />
          <NavRow label={t("me.reportCardsShared")} path="/reports/shared" />
          <NavRow label={t("me.analyticsReadiness")} path="/analytics" />
          <NavRow label={t("me.scheduleAccounts")} path="/schedule" />
        </div>

        {/* Friends */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
            Friends
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={addFriendInput}
              onChange={e => setAddFriendInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddFriend()}
              placeholder={t("me.friendInputPlaceholder")}
              style={{
                flex: 1, minHeight: 46, padding: "0 14px", fontFamily: T.font, fontSize: 13.5,
                border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text,
              }}
            />
            <button
              onClick={handleAddFriend}
              style={{ minHeight: 46, padding: "0 18px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              {t("me.add")}
            </button>
          </div>
          {addFriendError && <div style={{ color: T.wrong, fontFamily: T.font, fontSize: 12 }}>{addFriendError}</div>}

          {friendsLoading ? (
            <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted }}>{t("me.loadingFriends")}</div>
          ) : friends.length === 0 ? (
            <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted }}>{t("me.noFriends")}</div>
          ) : friends.map((f) => (
            <div
              key={f.principal}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 17, background: T.bg, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, fontWeight: 600, fontSize: 13, color: T.text, flexShrink: 0 }}>
                {f.displayName[0]?.toUpperCase() ?? "?"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: T.text, lineHeight: 1.25 }}>{f.displayName}</div>
                <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, color: T.faint, marginTop: 5 }}>
                  ELO {Math.round(f.accuracy * 1400)} · {Number(f.streak) > 0 ? `${Number(f.streak)} DAY STREAK` : `${Math.round(f.accuracy * 100)}% ACCURACY`}
                </div>
              </div>
              <button onClick={() => handleRemoveFriend(f.principal)} style={{ minHeight: 44, background: "transparent", border: 0, color: T.faint, fontFamily: T.font, fontWeight: 600, fontSize: 11.5, cursor: "pointer", padding: "0 2px" }}>
                {t("me.remove")}
              </button>
            </div>
          ))}

          <button
            onClick={handleCopyShareLink}
            style={{ minHeight: 44, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.font, fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}
          >
            {copied ? t("me.copied") : t("me.copyShareLink")}
          </button>
        </div>

        {/* Device */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
            Device
          </div>

          {/* Offline audio */}
          {storage && (
            <div style={{ padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 13.5, color: T.text }}>
                    {t("me.offlineStorage")}
                  </div>
                  <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 12, color: T.muted, marginTop: 3 }}>
                    {storage.totalBytes > 0 ? t("me.storageUsed", { used: formatMB(storage.totalBytes), quota: formatMB(storage.quotaBytes) }) : t("me.noDownloads")}
                  </div>
                </div>
                {storage.totalBytes > 0 && (
                  <button onClick={handleClearAll} disabled={clearingStorage} style={{ minHeight: 44, padding: "0 12px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, fontFamily: T.font, fontWeight: 600, fontSize: 11.5, cursor: "pointer", flexShrink: 0 }}>
                    {clearingStorage ? t("me.clearing") : t("me.clearAll")}
                  </button>
                )}
              </div>
              {downloadedArticles.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", marginTop: 12, borderTop: `1px solid ${T.hairline}` }}>
                  {downloadedArticles.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 0", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                      <span style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, color: T.muted }}>{t("me.audioDownloaded", { number: Number(a.number) })}</span>
                      <button onClick={() => handleDeleteDownload(a.id)} style={{ minHeight: 40, background: "transparent", border: 0, color: T.faint, fontFamily: T.font, fontWeight: 600, fontSize: 11.5, cursor: "pointer", padding: "0 2px" }}>
                        {t("me.delete")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Push reminders */}
          <div style={{ padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 13.5, color: T.text }}>{t("me.pushTitle")}</div>
              <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 12, color: T.muted, marginTop: 3 }}>
                {Capacitor.isNativePlatform() || isWebPushSupported() ? t("me.pushSupported") : t("me.pushUnsupported")}
              </div>
            </div>
            <button
              onClick={handleTogglePush}
              disabled={pushBusy || (!Capacitor.isNativePlatform() && !isWebPushSupported())}
              style={{ width: 52, height: 30, borderRadius: 15, border: `1px solid ${pushEnabled ? fill.accent : T.border}`, background: pushEnabled ? fill.accent : T.surface, position: "relative", padding: 0, flexShrink: 0, cursor: "pointer", opacity: pushBusy ? 0.6 : 1 }}
            >
              <span style={{ position: "absolute", top: 3, left: pushEnabled ? 27 : 3, width: 22, height: 22, borderRadius: 11, background: pushEnabled ? fill.onAccent : T.muted, display: "block", transition: "left 0.15s" }} />
            </button>
          </div>
          {pushError && <div style={{ fontFamily: T.font, fontSize: 11, color: T.wrong }}>{pushError}</div>}

          {/* Dark mode */}
          <div style={{ padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 13.5, color: T.text }}>{t("me.darkModeTitle")}</div>
              <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 12, color: T.muted, marginTop: 3 }}>{t("me.darkModeDesc")}</div>
            </div>
            <button
              onClick={() => { setMode(T.mode === "dark" ? "light" : "dark"); window.location.reload(); }}
              style={{ width: 52, height: 30, borderRadius: 15, border: `1px solid ${T.mode === "dark" ? fill.accent : T.border}`, background: T.mode === "dark" ? fill.accent : T.surface, position: "relative", padding: 0, flexShrink: 0, cursor: "pointer" }}
            >
              <span style={{ position: "absolute", top: 3, left: T.mode === "dark" ? 27 : 3, width: 22, height: 22, borderRadius: 11, background: T.mode === "dark" ? fill.onAccent : T.muted, display: "block", transition: "left 0.15s" }} />
            </button>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={() => logout()}
          style={{ minHeight: 48, background: "transparent", border: `1px solid oklch(0.68 0.19 32 / 0.5)`, borderRadius: 8, color: fill.wrong, fontFamily: T.font, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
        >
          {t("me.signOut")}
        </button>
      </div>
    </div>
  );
}
