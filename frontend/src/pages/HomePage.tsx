import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { challengeService, type Challenge } from "../services/challenge";
import { rankingService, type UserStats, type DailyActivity } from "../services/ranking";
import { userService, type StudyPace, type WeeklySchedule, type UpcomingGame } from "../services/user";
import { contentService, type Article } from "../services/content";
import { isInLastFiveDaysOfMonth } from "./MonthlyQuizPage";
import { mentorshipService } from "../services/mentorship";
import { reportService } from "../services/report";
import { useSport } from "../lib/sport";

const STREAK_MILESTONES = [100, 30, 7];
const STREAK_MILESTONE_KEY = "officialiq_streak_milestone_seen";

export default function HomePage() {
  const navigate   = useNavigate();
  const { t } = useTranslation();
  const { profile, principal, isAuthenticated } = useAuthStore();
  const { sportId, levelId } = useSport();
  const [stats,      setStats]      = useState<UserStats | null>(null);
  const [dailyStreak, setDailyStreak] = useState<DailyActivity | null>(null);
  const [milestoneToast, setMilestoneToast] = useState<string | null>(null);
  const [unseenNotes, setUnseenNotes] = useState(0);
  const [unseenReports, setUnseenReports] = useState(0);
  const [nextGame, setNextGame] = useState<UpcomingGame | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [names,       setNames]     = useState<Record<string, string>>({});
  const [accepting,   setAccepting] = useState<string | null>(null);

  const [articles,  setArticles]  = useState<Article[]>([]);
  const [pace,       setPace]       = useState<StudyPace | null>(null);
  const [schedule,   setSchedule]   = useState<WeeklySchedule | null>(null);

  function refreshChallenges() {
    challengeService.getMyChallenges().then(async (cs) => {
      setChallenges(cs);
      const incoming = cs.filter(c => "Pending" in c.status && c.challenged.toString() === principal);
      const resolved = await Promise.all(incoming.map(async (c) => {
        const key = c.challenger.toString();
        const prof = await userService.getProfile(c.challenger).catch(() => null);
        return [key, prof?.displayName ?? t("home.anOfficial")] as const;
      }));
      setNames(Object.fromEntries(resolved));
    }).catch(() => {});
  }

  async function refreshSchedule() {
    try {
      const arts = await contentService.listArticles(sportId, levelId);
      const sorted = [...arts].sort((a, b) => Number(a.number) - Number(b.number));
      setArticles(sorted);
      const myPace = await userService.getMyStudyPace();
      setPace(myPace);
      if (myPace) {
        const sched = await userService.getWeeklySchedule(sorted.map(a => a.id));
        setSchedule(sched);
      }
    } catch {
      // leave the weekly module hidden on failure
    }
  }

  useEffect(() => {
    rankingService.getMyStats().then(setStats).catch(() => {});
    if (principal) {
      rankingService.getDailyStreak().then((activity) => {
        setDailyStreak(activity);
        if (!activity) return;
        const current = Number(activity.currentStreak);
        const seen = Number(localStorage.getItem(STREAK_MILESTONE_KEY) ?? "0");
        const hit = STREAK_MILESTONES.find(m => current >= m && m > seen);
        if (hit) {
          setMilestoneToast(t("home.streakMilestone", { count: hit }));
          localStorage.setItem(STREAK_MILESTONE_KEY, String(hit));
        }
      }).catch(() => {});
      refreshChallenges();
      mentorshipService.getMyUnseenAnnotationCount().then(setUnseenNotes).catch(() => {});
      reportService.getMyUnseenShareCount().then(setUnseenReports).catch(() => {});
      userService.getMyUpcomingGames().then(gs => setNextGame(gs.length ? gs[0] : null)).catch(() => {});
    }
    if (isAuthenticated && profile) refreshSchedule();
  }, [isAuthenticated, principal, !!profile, sportId, levelId]);

  async function handleAccept(id: string) {
    setAccepting(id);
    try {
      await challengeService.acceptChallenge(id);
      navigate(`/challenge/${id}`);
    } catch {
      // leave it in the inbox; user can retry
    } finally {
      setAccepting(null);
    }
  }

  const pending = challenges.filter(c => "Pending" in c.status && c.challenged.toString() === principal);
  const streak  = dailyStreak?.currentStreak ?? stats?.streak ?? 14n;
  const accuracy = stats ? Math.round(stats.accuracy * 100) : 84;

  const articleTitle = (id: string) => {
    const a = articles.find(x => x.id === id);
    return a ? `Art. ${Number(a.number)}` : id;
  };

  const dueCount = schedule?.dueThisWeek.length ?? 0;
  const overdueCount = schedule?.overdue.length ?? 0;
  const weekTotal = pace ? Number(pace.articlesPerWeek) : 0;
  const doneThisWeek = Math.max(0, weekTotal - dueCount);
  const weekProgressPct = weekTotal > 0 ? Math.round((doneThisWeek / weekTotal) * 100) : 0;
  const isCatchingUp = overdueCount > 0;
  const nextArticleId = (isCatchingUp ? schedule?.overdue[0] : schedule?.dueThisWeek[0]) ?? null;
  const continueLabel = !nextArticleId
    ? t("home.allCaughtUp")
    : isCatchingUp
      ? `▶ ${t("home.catchUp", { article: articleTitle(nextArticleId) })}`
      : `▶ ${t("home.continueWeekStudy", { week: schedule?.weekNumber ?? 1 })}`;

  return (
    <div style={{ paddingBottom: 16 }}>
      {milestoneToast && (
        <div
          onClick={() => setMilestoneToast(null)}
          style={{
            background: T.red, color: T.white, textAlign: "center",
            padding: "8px 16px", fontSize: 13, fontWeight: 700,
          }}
        >
          {milestoneToast}
        </div>
      )}
      {unseenNotes > 0 && (
        <div
          onClick={() => navigate("/mentor")}
          style={{
            background: T.navy, color: T.white, textAlign: "center",
            padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          🧑‍🏫 {t("home.newNotesFromMentor", { count: unseenNotes })}
        </div>
      )}
      {unseenReports > 0 && (
        <div
          onClick={() => navigate("/reports/shared")}
          style={{
            background: T.red, color: T.white, textAlign: "center",
            padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          📋 {t("home.reportCardsShared", { count: unseenReports })}
        </div>
      )}
      {nextGame && (
        <div
          onClick={() => navigate("/schedule")}
          style={{
            background: T.navy, color: T.white, textAlign: "center",
            padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          📅 {t("home.gameVs", { opponent: nextGame.opponent, date: new Date(Number(nextGame.gameDate) / 1e6).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) })}
        </div>
      )}
      {/* Header */}
      <div style={{
        background: T.navy, color: T.white,
        padding: "52px 20px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: `2px solid ${T.red}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>🛡</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>OfficialIQ</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ background: T.red, borderRadius: 12, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
            🔴 {streak.toString()}
          </span>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: T.muted,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 13, color: T.white,
          }}>
            {profile?.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div style={{ background: T.navy, display: "flex", padding: "0 20px 20px" }}>
        {[
          { key: "dayStreak",  value: streak.toString(),  label: t("home.dayStreak"), icon: "🔥" },
          { key: "stateRank",  value: "#47",              label: t("home.stateRank"),  icon: "📊" },
          { key: "accuracy",   value: `${accuracy}%`,     label: t("home.accuracy"),    icon: "🎯" },
        ].map((s) => (
          <div key={s.key} style={{ flex: 1, textAlign: "center", color: T.white }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.key === "stateRank" ? "#A8C4F5" : T.white }}>
              {s.value}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{s.label}</div>
            <div style={{ fontSize: 16, marginTop: 4 }}>{s.icon}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        {/* Weekly module */}
        {!pace ? (
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 12, padding: "14px 16px", marginBottom: 12, textAlign: "center",
          }}>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 10 }}>
              {t("home.setStudyPaceDesc")}
            </div>
            <button
              onClick={() => navigate("/me")}
              style={{ padding: "10px 20px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
            >
              {t("home.setStudyPace")}
            </button>
          </div>
        ) : (
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 12, padding: "14px 16px", marginBottom: 12,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>
                {t("home.thisWeek")} — {schedule && schedule.dueThisWeek.length > 0
                  ? schedule.dueThisWeek.map(articleTitle).join(", ")
                  : t("home.allCaughtUpShort")}
              </span>
              <span style={{ fontSize: 12, color: T.muted }}>{t("home.doneCount", { done: doneThisWeek, total: weekTotal })}</span>
            </div>
            <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ height: "100%", width: `${weekProgressPct}%`, background: T.red, borderRadius: 2 }} />
            </div>
            {overdueCount > 0 && (
              <div style={{
                fontSize: 12, color: T.wrong, marginBottom: 10,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                ⚠️ {t("home.overdueArticles", { count: overdueCount })} — {schedule!.overdue.map(articleTitle).join(", ")}
              </div>
            )}
            <button
              onClick={() => {
                if (!nextArticleId) navigate("/study");
                else if (isCatchingUp) navigate(`/quiz/${nextArticleId}`);
                else navigate("/weekly-quiz");
              }}
              disabled={!nextArticleId}
              style={{
                width: "100%", padding: "13px 0",
                background: nextArticleId ? T.red : T.border, color: T.white,
                borderRadius: 8, fontSize: 15, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {continueLabel}
            </button>
          </div>
        )}

        {/* Monthly exam banner — surfaces only during its open window */}
        {isInLastFiveDaysOfMonth(new Date()) && (
          <button
            onClick={() => navigate("/monthly-quiz")}
            style={{
              width: "100%", padding: "14px 16px", marginBottom: 12,
              background: T.navy, color: T.white, borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              border: "none", textAlign: "left",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>📊 {t("home.monthlyExamOpen")}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{t("home.monthlyExamDesc")}</div>
            </div>
            <span style={{ fontSize: 18 }}>›</span>
          </button>
        )}

        {/* Quick actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[
            { key: "audio", label: t("home.audioMode"), icon: "🎧", path: "/audio" },
            { key: "commute", label: t("home.commute"), icon: "🚗", path: "/commute" },
            { key: "quickDrill", label: t("home.quickDrill"), icon: "⚡", path: "/quiz/ncaa_basketball:art4" },
          ].map((a) => (
            <button
              key={a.key}
              onClick={() => navigate(a.path)}
              style={{
                padding: "14px 4px", background: T.surface,
                border: `1px solid ${T.border}`, borderRadius: 10,
                fontSize: 12, fontWeight: 600,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <span style={{ fontSize: 18 }}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>

        {/* Challenge inbox */}
        {pending.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((c) => (
              <div
                key={c.id}
                style={{
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 10, padding: "12px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 14 }}>
                  {t("home.challengeFrom")} <strong>{names[c.challenger.toString()] ?? t("home.anOfficial")}</strong>
                </span>
                <button
                  onClick={() => handleAccept(c.id)}
                  disabled={accepting === c.id}
                  style={{ background: "transparent", color: T.red, fontWeight: 700, fontSize: 14 }}
                >
                  {accepting === c.id ? t("home.accepting") : t("home.accept")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
