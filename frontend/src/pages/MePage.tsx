import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
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
          padding: "13px 0", background: submitting ? T.border : T.navy, color: T.white,
          borderRadius: 8, fontSize: 15, fontWeight: 700,
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
      <div>
        <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t("me.profileHeader")}</div>
        </div>
        <div style={{ padding: 24, textAlign: "center", color: T.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
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
              padding: "13px 32px", background: T.navy, color: T.white,
              borderRadius: 8, fontSize: 15, fontWeight: 700,
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
      <div>
        <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t("me.welcomeTitle")}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
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
      <div>
        <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t("me.editProfileHeader")}</div>
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

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 24px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: T.red, color: T.white,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700,
          }}>
            {profile.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {profile.displayName}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
              {profile.level} · {profile.state || "—"}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: "6px 12px", background: "rgba(255,255,255,0.12)",
              color: T.white, borderRadius: 6, fontSize: 12, fontWeight: 600,
            }}
          >
            {t("me.editProfile")}
          </button>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 8, wordBreak: "break-all" }}>
          {principal}
        </div>
      </div>

      {stats && (
        <div style={{
          display: "flex", padding: "16px 20px",
          borderBottom: `1px solid ${T.border}`,
        }}>
          {[
            { label: t("me.exams"),    value: Number(stats.examCount) },
            { label: t("me.streak"),   value: Number(stats.streak) },
            { label: t("me.accuracy"), value: `${Math.round(stats.accuracy * 100)}%` },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.navy }}>{s.value}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {badges.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
            {t("me.badgesEarned", { earned: badges.filter(b => b.earned).length, total: badges.length })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {badges.map((b) => (
              <div
                key={b.id}
                title={b.description}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  padding: "10px 4px", background: b.earned ? T.surface : T.bg,
                  border: `1px solid ${b.earned ? T.navy : T.border}`, borderRadius: 8,
                  opacity: b.earned ? 1 : 0.45,
                }}
              >
                <span style={{ fontSize: 22 }}>{b.icon}</span>
                <span style={{ fontSize: 9, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{b.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {storage && (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{t("me.offlineStorage")}</div>
            {storage.totalBytes > 0 && (
              <button
                onClick={handleClearAll}
                disabled={clearingStorage}
                style={{ fontSize: 12, color: T.wrong, fontWeight: 600, background: "transparent" }}
              >
                {clearingStorage ? t("me.clearing") : t("me.clearAll")}
              </button>
            )}
          </div>

          <div style={{ padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              {t("me.storageUsed", { used: formatMB(storage.totalBytes), quota: formatMB(storage.quotaBytes) })}
            </div>
            <div style={{ height: 6, background: T.bg, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
              <div style={{
                height: "100%", borderRadius: 3, background: T.navy,
                width: `${Math.min(100, (storage.totalBytes / storage.quotaBytes) * 100)}%`,
              }} />
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 11, color: T.muted }}>
              <span>{t("me.articlesStorage", { size: formatMB(storage.articlesBytes) })}</span>
              <span>{t("me.questionsStorage", { size: formatMB(storage.questionsBytes) })}</span>
              <span>{t("me.audioStorage", { size: formatMB(storage.audioBytes) })}</span>
            </div>
          </div>

          {downloadedArticles.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {downloadedArticles.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: 12 }}>{t("me.audioDownloaded", { number: Number(a.number) })}</span>
                  <button
                    onClick={() => handleDeleteDownload(a.id)}
                    style={{ fontSize: 11, color: T.wrong, fontWeight: 600, background: "transparent" }}
                  >
                    {t("me.delete")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "16px 16px 0" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t("me.pushTitle")}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
              {Capacitor.isNativePlatform() || isWebPushSupported()
                ? t("me.pushSupported")
                : t("me.pushUnsupported")}
            </div>
          </div>
          <button
            onClick={handleTogglePush}
            disabled={pushBusy || (!Capacitor.isNativePlatform() && !isWebPushSupported())}
            style={{
              width: 44, height: 26, borderRadius: 13, position: "relative", flexShrink: 0,
              background: pushEnabled ? T.navy : T.border, opacity: pushBusy ? 0.6 : 1,
            }}
          >
            <span style={{
              position: "absolute", top: 3, left: pushEnabled ? 21 : 3,
              width: 20, height: 20, borderRadius: "50%", background: T.white,
              transition: "left 0.15s",
            }} />
          </button>
        </div>
        {pushError && (
          <div style={{ fontSize: 11, color: T.wrong, marginTop: 6 }}>{pushError}</div>
        )}
      </div>

      <div style={{ padding: "12px 16px 0" }}>
        <button
          onClick={() => navigate("/groups")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.studyGroups")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        <button
          onClick={() => navigate("/progress")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.viewFullProgress")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        <button
          onClick={() => navigate("/mentor")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.mentorship")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        <button
          onClick={() => navigate("/association")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.associations")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        <button
          onClick={() => navigate("/submit-clip")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.submitClip")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        <button
          onClick={() => navigate("/analytics")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.analyticsReadiness")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        <button
          onClick={() => navigate("/schedule")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.scheduleAccounts")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        <button
          onClick={() => navigate("/ask")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.askRuleAssistant")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        <button
          onClick={() => navigate("/ai-drills")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.aiPracticeDrills")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        {isAiAdmin && (
          <button
            onClick={() => navigate("/ai-scenarios")}
            style={{
              width: "100%", padding: "12px 14px", background: T.surface,
              border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 13, fontWeight: 600,
            }}
          >
            {t("me.aiScenarioGenerator")}
            <span style={{ color: T.muted }}>›</span>
          </button>
        )}
        <button
          onClick={() => navigate("/reports")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.reportCard")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        <button
          onClick={() => navigate("/reports/shared")}
          style={{
            width: "100%", padding: "12px 14px", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 13, fontWeight: 600,
          }}
        >
          {t("me.reportCardsShared")}
          <span style={{ color: T.muted }}>›</span>
        </button>
        {isContentAdmin && (
          <button
            onClick={() => navigate("/moderation")}
            style={{
              width: "100%", padding: "12px 14px", background: T.surface,
              border: `1px solid ${T.border}`, borderRadius: 8, marginTop: 10,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 13, fontWeight: 600,
            }}
          >
            {t("me.clipModerationQueue")}
            <span style={{ color: T.muted }}>›</span>
          </button>
        )}
      </div>

      {/* Friends */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{t("me.friends")}</div>
          <button
            onClick={handleCopyShareLink}
            style={{ fontSize: 12, color: T.navy, fontWeight: 600, background: "transparent" }}
          >
            {copied ? t("me.copied") : t("me.copyShareLink")}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={addFriendInput}
            onChange={e => setAddFriendInput(e.target.value)}
            placeholder={t("me.friendInputPlaceholder")}
            style={{
              flex: 1, padding: "9px 10px", fontSize: 13,
              border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text,
            }}
          />
          <button
            onClick={handleAddFriend}
            style={{ padding: "9px 14px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
          >
            {t("me.add")}
          </button>
        </div>
        {addFriendError && (
          <div style={{ color: T.wrong, fontSize: 12, marginBottom: 8 }}>{addFriendError}</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {friendsLoading ? (
            <div style={{ fontSize: 13, color: T.muted }}>{t("me.loadingFriends")}</div>
          ) : friends.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted }}>
              {t("me.noFriends")}
            </div>
          ) : friends.map((f) => (
            <div
              key={f.principal}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", background: T.surface,
                border: `1px solid ${T.border}`, borderRadius: 8,
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: "50%", background: T.border,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 13, flexShrink: 0,
              }}>
                {f.displayName[0]?.toUpperCase() ?? "?"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{f.displayName}</div>
                <div style={{ fontSize: 11, color: T.muted }}>
                  {Math.round(f.accuracy * 100)}% acc. {Number(f.streak) > 0 && `· 🔥 ${Number(f.streak)}`}
                </div>
              </div>
              <button
                onClick={() => handleRemoveFriend(f.principal)}
                style={{ fontSize: 12, color: T.wrong, background: "transparent" }}
              >
                {t("me.remove")}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        <button
          onClick={() => logout()}
          style={{
            width: "100%", padding: "12px 0",
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, fontSize: 14, color: T.wrong, fontWeight: 600,
          }}
        >
          {t("me.signOut")}
        </button>
      </div>
    </div>
  );
}
