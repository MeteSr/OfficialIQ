import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
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
  const [stats,        setStats]        = useState<UserStats | null>(null);
  const [dailyStreak,  setDailyStreak]  = useState<DailyActivity | null>(null);
  const [milestoneToast, setMilestoneToast] = useState<string | null>(null);
  const [unseenNotes,  setUnseenNotes]  = useState(0);
  const [unseenReports, setUnseenReports] = useState(0);
  const [nextGame,     setNextGame]     = useState<UpcomingGame | null>(null);
  const [challenges,   setChallenges]   = useState<Challenge[]>([]);
  const [names,        setNames]        = useState<Record<string, string>>({});
  const [accepting,    setAccepting]    = useState<string | null>(null);
  const [articles,     setArticles]     = useState<Article[]>([]);
  const [pace,         setPace]         = useState<StudyPace | null>(null);
  const [schedule,     setSchedule]     = useState<WeeklySchedule | null>(null);

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

  const pending    = challenges.filter(c => "Pending" in c.status && c.challenged.toString() === principal);
  const streak     = dailyStreak?.currentStreak ?? stats?.streak ?? 14n;
  const accuracy   = stats ? Math.round(stats.accuracy * 100) : 84;

  const articleTitle = (id: string) => {
    const a = articles.find(x => x.id === id);
    return a ? `Art. ${Number(a.number)}` : id;
  };

  const dueCount        = schedule?.dueThisWeek.length ?? 0;
  const overdueCount    = schedule?.overdue.length ?? 0;
  const weekTotal       = pace ? Number(pace.articlesPerWeek) : 0;
  const doneThisWeek    = Math.max(0, weekTotal - dueCount);
  const weekProgressPct = weekTotal > 0 ? Math.round((doneThisWeek / weekTotal) * 100) : 0;
  const isCatchingUp    = overdueCount > 0;
  const nextArticleId   = (isCatchingUp ? schedule?.overdue[0] : schedule?.dueThisWeek[0]) ?? null;

  const nextArticleTitle = nextArticleId ? articles.find(x => x.id === nextArticleId) : null;
  const nextArticleLabel = nextArticleTitle
    ? `Art. ${Number(nextArticleTitle.number)} — ${nextArticleTitle.title}`
    : t("home.allCaughtUp");
  const nextArticleDesc = isCatchingUp
    ? t("home.catchUpDesc", { count: overdueCount, minutes: "5" })
    : nextArticleId
      ? t("home.continueDesc", { week: schedule?.weekNumber ?? 1 })
      : t("home.allCaughtUpDesc");

  const greeting = profile?.displayName
    ? t("home.greeting", { name: profile.displayName.split(" ")[0] })
    : "Good evening";

  const weekLabel = schedule?.weekNumber ? `Week ${schedule.weekNumber}` : "Week";
  const levelLabel = levelId ? levelId.charAt(0).toUpperCase() + levelId.slice(1) : "varsity";

  return (
    <div style={{ paddingBottom: 64, background: T.bg, minHeight: "100dvh", fontFamily: T.font }}>

      {/* Banners */}
      {milestoneToast && (
        <div
          onClick={() => setMilestoneToast(null)}
          style={{ background: fill.accent, color: fill.onAccent, textAlign: "center", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          {milestoneToast}
        </div>
      )}
      {unseenNotes > 0 && (
        <div
          onClick={() => navigate("/mentor")}
          style={{ background: T.panelAlt, color: T.text, textAlign: "center", padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {t("home.newNotesFromMentor", { count: unseenNotes })}
        </div>
      )}
      {unseenReports > 0 && (
        <div
          onClick={() => navigate("/reports/shared")}
          style={{ background: fill.accent, color: fill.onAccent, textAlign: "center", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          {t("home.reportCardsShared", { count: unseenReports })}
        </div>
      )}

      {/* Upcoming game banner */}
      {nextGame && (
        <div
          onClick={() => navigate("/schedule")}
          style={{ background: T.panelAlt, color: T.text, textAlign: "center", padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <span style={{ color: T.attention, fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.08em" }}>
            {new Date(Number(nextGame.gameDate) / 1e6).toLocaleDateString(undefined, { weekday: "short" }).toUpperCase()}
          </span>
          {t("home.gameVs", { opponent: nextGame.opponent, date: "" }).trim()}
          {" "}·{" "}
          {new Date(Number(nextGame.gameDate) / 1e6).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </div>
      )}

      {/* Header */}
      <div style={{ background: T.panelAlt, padding: "52px 20px 0", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.13em", textTransform: "uppercase", color: T.faint }}>
              {weekLabel} · {levelLabel}
            </div>
            <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 30, color: T.text, marginTop: 8, letterSpacing: "0.005em", lineHeight: 1.05 }}>
              {greeting}
            </div>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: 18, background: T.surface,
            border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 600, fontSize: 14, color: T.text, flexShrink: 0,
          }}>
            {profile?.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
        </div>

        {/* Stat row — rule-divided, no emoji */}
        <div style={{ display: "flex", marginTop: 20, borderTop: `1px solid ${T.hairline}`, paddingTop: 16, paddingBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 26, color: T.text, lineHeight: 1 }}>
              {streak.toString()}
            </div>
            <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.08em", color: T.faint, marginTop: 6 }}>
              DAY STREAK
            </div>
          </div>
          <div style={{ flex: 1, borderLeft: `1px solid ${T.hairline}`, paddingLeft: 16 }}>
            <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 26, color: fill.accent, lineHeight: 1 }}>
              #47
            </div>
            <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.08em", color: T.faint, marginTop: 6 }}>
              STATE RANK
            </div>
          </div>
          <div style={{ flex: 1, borderLeft: `1px solid ${T.hairline}`, paddingLeft: 16 }}>
            <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 26, color: T.text, lineHeight: 1 }}>
              {accuracy}%
            </div>
            <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.08em", color: T.faint, marginTop: 6 }}>
              ACCURACY
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Do this next card */}
        {!pace ? (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.hairline}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
                Do this next
              </span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontFamily: T.fontCondensed, fontWeight: 600, fontSize: 18, color: T.text, letterSpacing: "0.01em" }}>
                Set your study pace
              </div>
              <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, lineHeight: 1.5, color: T.muted, marginTop: 6 }}>
                Choose how many articles to cover each week. Your schedule will appear here.
              </div>
              <button
                onClick={() => navigate("/me")}
                style={{ width: "100%", minHeight: 48, marginTop: 18, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 15, cursor: "pointer" }}
              >
                Set pace
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${T.hairline}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
                Do this next
              </span>
              {overdueCount > 0 && (
                <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.06em", color: T.wrong }}>
                  {overdueCount} OVERDUE
                </span>
              )}
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontFamily: T.fontCondensed, fontWeight: 600, fontSize: 20, color: T.text, letterSpacing: "0.01em", lineHeight: 1.2 }}>
                {nextArticleLabel}
              </div>
              <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, lineHeight: 1.5, color: T.muted, marginTop: 6 }}>
                {nextArticleDesc}
              </div>
              {/* Progress bar */}
              <div style={{ display: "flex", gap: 3, margin: "16px 0 8px" }}>
                <div style={{ flex: weekProgressPct, height: 5, borderRadius: 3, background: fill.accent }} />
                <div style={{ flex: 100 - weekProgressPct, height: 5, borderRadius: 3, background: T.border }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.fontMono, fontWeight: 500, fontSize: 10.5, color: T.faint }}>
                <span>WEEK {schedule?.weekNumber ?? 1} · {doneThisWeek} OF {weekTotal} DONE</span>
                {dueCount > 0 && (
                  <span>{schedule?.dueThisWeek.map(articleTitle).join(", ").toUpperCase()} DUE</span>
                )}
              </div>
              <button
                onClick={() => {
                  if (!nextArticleId) navigate("/study");
                  else if (isCatchingUp) navigate(`/quiz/${nextArticleId}`);
                  else navigate("/weekly-quiz");
                }}
                style={{
                  width: "100%", minHeight: 48, marginTop: 18,
                  background: nextArticleId ? fill.accent : T.border,
                  color: nextArticleId ? fill.onAccent : T.faint,
                  border: 0, borderRadius: 8,
                  fontFamily: T.font, fontWeight: 600, fontSize: 15, cursor: "pointer",
                }}
              >
                {isCatchingUp ? t("home.catchUp", { article: "" }).trim() || "Start catch-up drill" : t("home.continueWeekStudy", { week: schedule?.weekNumber ?? 1 })}
              </button>
            </div>
          </div>
        )}

        {/* Monthly exam window */}
        {isInLastFiveDaysOfMonth(new Date()) && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "15px 16px" }}>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
              Monthly exam window
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 10 }}>
              <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 34, color: T.attention, lineHeight: 1 }}>4</span>
              <span style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, lineHeight: 1.3, color: T.muted }}>days left · 25 questions</span>
            </div>
            <button
              onClick={() => navigate("/monthly-quiz")}
              style={{ width: "100%", minHeight: 44, marginTop: 14, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 14, color: T.text, cursor: "pointer" }}
            >
              {t("home.monthlyExamOpen")}
            </button>
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "Audio",       path: "/audio"    },
            { label: "Commute",     path: "/commute"  },
            { label: "Quick drill", path: "/quiz/ncaa_basketball:art4" },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.path)}
              style={{
                minHeight: 52, background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 10, fontFamily: T.font, fontWeight: 600, fontSize: 12.5, color: T.text,
                cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Challenge inbox */}
        {pending.length > 0 && pending.map((c) => (
          <div
            key={c.id}
            style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 10, padding: "13px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}
          >
            <span style={{ fontFamily: T.font, fontWeight: 400, fontSize: 14, color: T.text }}>
              {t("home.challengeFrom")} <strong style={{ fontWeight: 600 }}>{names[c.challenger.toString()] ?? t("home.anOfficial")}</strong>
            </span>
            <button
              onClick={() => handleAccept(c.id)}
              disabled={accepting === c.id}
              style={{ background: "transparent", border: 0, color: fill.accent, fontFamily: T.font, fontWeight: 600, fontSize: 14, minHeight: 44, cursor: "pointer", padding: "0 4px" }}
            >
              {accepting === c.id ? t("home.accepting") : t("home.accept")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
