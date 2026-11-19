import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "../components/LoadError";
import GradedQuiz from "../components/GradedQuiz";
import { userService } from "../services/user";
import { contentService } from "../services/content";
import { questionService } from "../services/question";
import { examService, type GradedFinish } from "../services/exam";
import type { Question } from "../services/question";
import { REFRESHER_SEC_PER_Q, gameTimeMs, loadLevelContext, pickedArticleIds, refresherPicks } from "../lib/gameDay";

type Phase = "intro" | "quiz" | "done";

// Game-day refresher (#63): a 5-minute quiz on the rules this official
// misses most plus plays at the game's level. The push two hours before a
// game opens it; the game card on the Schedule page links here too.
export default function RefresherPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const profileSport = useSport();
  const [phase, setPhase] = useState<Phase>("intro");
  const [result, setResult] = useState<{ finish: GradedFinish; questions: Question[] } | null>(null);

  const plan = useCanisterQuery(async () => {
    const games = await userService.getMyUpcomingGames();
    const game = games.find(g => g.id === gameId) ?? null;
    const sportId = game?.sportId || profileSport.sportId;
    const levelId = game?.levelId || profileSport.levelId;
    const [level, weak] = await Promise.all([
      loadLevelContext(sportId, levelId, {
        listArticles: (s, l) => contentService.listArticles(s, l),
        listPointsOfEmphasis: (season) => contentService.listPointsOfEmphasis(season),
      }),
      questionService.getMyWeakArticles(sportId, 3),
    ]);
    const titles = new Map(level.articles.map(a => [a.id, a.title]));
    const picks = refresherPicks(weak.map(w => w.articleId), level.articles.map(a => a.id), level.emphasisArticleIds);
    return { game, sportId, picks, weakTitles: weak.map(w => titles.get(w.articleId) ?? w.articleId) };
  }, [gameId, profileSport.sportId, profileSport.levelId]);

  const start = useCallback(() => {
    const p = plan.data!;
    const count = p.picks.reduce((n, pk) => n + pk.count, 0n);
    return examService.startGradedSession({
      sportId: p.sportId, articleIds: pickedArticleIds(p.picks), casebook: false,
      count, secPerQ: BigInt(REFRESHER_SEC_PER_Q), mode: { Solo: null },
    }, { Picks: p.picks });
  }, [plan.data]);

  const onFinished = useCallback((finish: GradedFinish, questions: Question[]) => {
    setResult({ finish, questions });
    setPhase("done");
  }, []);

  if (!isAuthenticated || !examService.gradingAvailable()) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{t("gameDay.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          {t("addFriend.goToProfile")}
        </button>
      </div>
    );
  }

  if (plan.error) return <LoadError onRetry={plan.reload} />;
  if (plan.loading || !plan.data) return <div role="status" style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;

  const { game, weakTitles } = plan.data;
  const label = game ? game.opponent : t("gameDay.refresherTitle");

  if (phase === "quiz") {
    return <GradedQuiz start={start} secPerQ={REFRESHER_SEC_PER_Q} label={label} onBack={() => navigate("/schedule")} onFinished={onFinished} />;
  }

  if (phase === "done" && result) {
    const score = Number(result.finish.session.score[0] ?? 0n);
    const missed = result.finish.feedback.filter(f => !f.isCorrect);
    const stems = new Map(result.questions.map(q => [q.id, q.stem]));
    return (
      <div style={{ padding: "52px 16px 24px" }}>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("gameDay.scoreLine", { score })}</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
          {missed.length === 0 ? t("gameDay.allCorrect") : t("gameDay.reviewBeforeGame", { count: missed.length })}
        </div>
        {missed.map(f => (
          <div key={f.questionId} style={{ padding: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.wrong, marginBottom: 4 }}>{f.citation}</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>{stems.get(f.questionId)}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{f.explanation}</div>
          </div>
        ))}
        <button onClick={() => navigate("/schedule")} style={{ width: "100%", marginTop: 12, padding: "13px 0", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          {t("gameDay.backToSchedule")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ background: T.navy, padding: "52px 20px 16px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{t("gameDay.refresherTitle")}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          {game
            ? t("gameDay.refresherFor", { game: game.opponent, time: new Date(gameTimeMs(game.gameDate)).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) })
            : t("gameDay.refresherGeneric")}
        </div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("gameDay.refresherLength")}</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 6 }}>
          {weakTitles.length > 0 ? t("gameDay.focusWeak") : t("gameDay.focusLevel")}
        </div>
        {weakTitles.map(title => (
          <div key={title} style={{ fontSize: 13, padding: "6px 10px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 6 }}>{title}</div>
        ))}
        <div style={{ fontSize: 13, color: T.muted, margin: "10px 0 20px" }}>{t("gameDay.focusPlays")}</div>
        <button onClick={() => setPhase("quiz")} style={{ width: "100%", padding: "14px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          {t("gameDay.startRefresher")}
        </button>
      </div>
    </div>
  );
}
