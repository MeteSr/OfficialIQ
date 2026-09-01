import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill, tint } from "../tokens";
import { contentService, type Article } from "../services/content";
import { questionService, type Question } from "../services/question";
import { userService, type WeeklyQuizResult } from "../services/user";
import { rankingService } from "../services/ranking";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";

const SECONDS_PER_Q = 30;
const TOTAL_QUESTIONS = 10;
const NEW_RATIO = 0.6;
const POE_RATIO = 0.2;
const SEVEN_DAYS_NS = 7n * 24n * 3600n * 1_000_000_000n;
const CURRENT_SEASON = "2025-26";

type Source = "new" | "retention" | "poe";
type TaggedQuestion = Question & { _source: Source };

type Plan = {
  weekNumber: number;
  newArticles: Article[];
  retentionArticles: Article[];
  newCount: number;
  retentionCount: number;
  poeArticleIds: string[];
  poeCount: number;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function WeeklyQuizPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, profile } = useAuthStore();
  const { sportId, levelId } = useSport();

  const [phase,   setPhase]   = useState<"loading" | "preview" | "quiz" | "results" | "error" | "empty">("loading");
  const [error,   setError]   = useState<string | null>(null);
  const [plan,    setPlan]    = useState<Plan | null>(null);
  const [history, setHistory] = useState<WeeklyQuizResult[]>([]);

  const [questions,  setQuestions]  = useState<TaggedQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [chosen,      setChosen]      = useState<string | null>(null);
  const [timeLeft,    setTimeLeft]    = useState(SECONDS_PER_Q);
  const [answered,    setAnswered]    = useState<{ q: TaggedQuestion; correct: boolean }[]>([]);

  useEffect(() => {
    if (!isAuthenticated) { setPhase("error"); setError(t("weeklyQuiz.signInRequired")); return; }

    (async () => {
      const arts = await contentService.listArticles(sportId, levelId);
      const sorted = [...arts].sort((a, b) => Number(a.number) - Number(b.number));
      const [schedule, progress, hist, poes] = await Promise.all([
        userService.getWeeklySchedule(sorted.map(a => a.id)),
        userService.getMyProgress(),
        userService.getWeeklyQuizHistory(),
        contentService.listPointsOfEmphasis(CURRENT_SEASON).catch(() => []),
      ]);
      setHistory(hist);
      const poeArticleIds = [...new Set(poes.flatMap(p => p.linkedArticleIds))];

      const newArticleIds = new Set(schedule.dueThisWeek);
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      const retentionCandidates = progress
        .filter(p => !newArticleIds.has(p.articleId))
        .sort((a, b) => {
          if (a.masteryScore !== b.masteryScore) return Number(a.masteryScore - b.masteryScore);
          return Number(a.lastStudied - b.lastStudied);
        });
      const stale = retentionCandidates.filter(p => nowNs - p.lastStudied >= SEVEN_DAYS_NS);
      const retentionPool = (stale.length > 0 ? stale : retentionCandidates).map(p => p.articleId);

      // Reserve ~20% of the quiz for Points-of-Emphasis questions when any POE
      // items are seeded for the current season, then split the remainder
      // between new and retention as before.
      const poeCount = poeArticleIds.length > 0 ? Math.round(TOTAL_QUESTIONS * POE_RATIO) : 0;
      const remaining = TOTAL_QUESTIONS - poeCount;
      let newCount = Math.round(remaining * NEW_RATIO);
      let retentionCount = remaining - newCount;
      if (newArticleIds.size === 0) { newCount = 0; retentionCount = remaining; }
      if (retentionPool.length === 0) { retentionCount = 0; newCount = remaining; }

      if (newCount === 0 && retentionCount === 0 && poeCount === 0) {
        setPhase("empty");
        return;
      }

      const byId = (id: string) => sorted.find(a => a.id === id);
      setPlan({
        weekNumber: Number(schedule.weekNumber),
        newArticles: schedule.dueThisWeek.map(byId).filter((a): a is Article => !!a),
        retentionArticles: retentionPool.slice(0, 5).map(byId).filter((a): a is Article => !!a),
        newCount,
        retentionCount,
        poeArticleIds,
        poeCount,
      });
      setPhase("preview");
    })().catch(() => { setPhase("error"); setError(t("weeklyQuiz.loadFailed")); });
  }, [isAuthenticated, sportId, levelId]);

  async function handleStart() {
    if (!plan) return;
    setPhase("loading");
    try {
      const [newQs, retentionQs, poePool] = await Promise.all([
        plan.newCount > 0
          ? questionService.sampleQuiz({
              sportId, articleIds: plan.newArticles.map(a => a.id),
              casebook: false, difficulty: [], count: BigInt(plan.newCount),
            })
          : Promise.resolve([]),
        plan.retentionCount > 0
          ? questionService.sampleQuiz({
              sportId, articleIds: plan.retentionArticles.map(a => a.id),
              casebook: false, difficulty: [], count: BigInt(plan.retentionCount),
            })
          : Promise.resolve([]),
        plan.poeCount > 0
          ? Promise.all([
              questionService.sampleQuiz({ sportId, articleIds: plan.poeArticleIds, casebook: false, difficulty: [], count: 50n }),
              questionService.sampleQuiz({ sportId, articleIds: plan.poeArticleIds, casebook: true,  difficulty: [], count: 50n }),
            ]).then(([a, b]) => [...a, ...b])
          : Promise.resolve([]),
      ]);
      const poeQs = shuffle(poePool.filter(q => q.isPointOfEmphasis)).slice(0, plan.poeCount);
      const tagged: TaggedQuestion[] = shuffle([
        ...newQs.map(q => ({ ...q, _source: "new" as const })),
        ...retentionQs.map(q => ({ ...q, _source: "retention" as const })),
        ...poeQs.map(q => ({ ...q, _source: "poe" as const })),
      ]);
      if (tagged.length === 0) {
        setPhase("empty");
        return;
      }
      setQuestions(tagged);
      setCurrentIdx(0);
      setAnswered([]);
      setChosen(null);
      setTimeLeft(SECONDS_PER_Q);
      setPhase("quiz");
    } catch {
      setError(t("weeklyQuiz.buildFailed"));
      setPhase("error");
    }
  }

  // Countdown timer
  useEffect(() => {
    if (phase !== "quiz" || chosen !== null) return;
    if (timeLeft === 0) { setChosen("__timeout__"); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft, chosen]);

  const currentQ = questions[currentIdx];

  const handleChoice = useCallback((choiceId: string) => {
    if (chosen !== null || !currentQ) return;
    setChosen(choiceId);
  }, [chosen, currentQ]);

  const handleNext = useCallback(async () => {
    if (!currentQ) return;
    const correct = chosen === currentQ.correctId;
    const updated = [...answered, { q: currentQ, correct }];
    setAnswered(updated);

    const isLast = currentIdx + 1 >= questions.length;
    if (!isLast) {
      setCurrentIdx(i => i + 1);
      setChosen(null);
      setTimeLeft(SECONDS_PER_Q);
      return;
    }

    // Finish: score each pool, persist progress + ranking + weekly history.
    const newAnswers = updated.filter(a => a.q._source === "new");
    const retentionAnswers = updated.filter(a => a.q._source === "retention");
    const newScore = newAnswers.length ? Math.round((newAnswers.filter(a => a.correct).length / newAnswers.length) * 100) : 0;
    const retentionScore = retentionAnswers.length ? Math.round((retentionAnswers.filter(a => a.correct).length / retentionAnswers.length) * 100) : 0;
    const overallScore = Math.round((updated.filter(a => a.correct).length / updated.length) * 100);
    rankingService.recordQuestionsAnswered(updated.length).catch(() => {});

    const byArticle = new Map<string, { correct: number; total: number }>();
    updated.forEach(({ q, correct }) => {
      const bucket = byArticle.get(q.articleId) ?? { correct: 0, total: 0 };
      bucket.total += 1;
      if (correct) bucket.correct += 1;
      byArticle.set(q.articleId, bucket);
    });

    await Promise.all([...byArticle.entries()].map(([articleId, b]) =>
      userService.recordArticleStudied(articleId, Math.round((b.correct / b.total) * 100)).catch(() => {})
    ));
    await userService.recordWeeklyQuizResult(plan?.weekNumber ?? 0, newScore, retentionScore).catch(() => {});
    if (profile) {
      await rankingService.recordExamResult(
        overallScore, updated.length, profile.displayName, profile.sport, profile.state || "TX", SECONDS_PER_Q,
      ).catch(() => {});
    }

    setPhase("results");
  }, [currentQ, chosen, answered, currentIdx, questions.length, plan, profile]);

  if (phase === "loading") {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80, fontFamily: T.font }}>{t("common.loading")}</div>;
  }

  if (phase === "error") {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: T.text }}>{error}</div>
        <button onClick={() => navigate("/home")} style={{ padding: "13px 32px", background: fill.accent, color: fill.onAccent, borderRadius: 8, fontSize: 15, fontWeight: 700, border: 0, cursor: "pointer" }}>
          {t("addFriend.backToHome")}
        </button>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: T.text }}>{t("weeklyQuiz.emptyTitle")}</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
          {t("weeklyQuiz.emptyDesc")}
        </div>
        <button onClick={() => navigate("/home")} style={{ padding: "13px 32px", background: fill.accent, color: fill.onAccent, borderRadius: 8, fontSize: 15, fontWeight: 700, border: 0, cursor: "pointer" }}>
          {t("addFriend.backToHome")}
        </button>
      </div>
    );
  }

  if (phase === "preview" && plan) {
    const totalQuestions = plan.newCount + plan.retentionCount + plan.poeCount;
    return (
      <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font }}>
        <div style={{ background: T.panelAlt, padding: "52px 20px 20px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 26, color: T.text, lineHeight: 1.05 }}>
            {t("weeklyQuiz.weekTitle", { week: plan.weekNumber })}
          </div>
          <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted, marginTop: 6 }}>
            {plan.poeCount > 0
              ? t("weeklyQuiz.subtitleWithPoe", { new: plan.newCount, retention: plan.retentionCount, poe: plan.poeCount, count: totalQuestions })
              : t("weeklyQuiz.subtitle", { new: plan.newCount, retention: plan.retentionCount, count: totalQuestions })}
          </div>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {plan.poeCount > 0 && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${fill.attention}`, borderRadius: 10, padding: "13px 16px" }}>
              <div style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.09em", color: T.attention }}>
                {t("weeklyQuiz.poeSectionTitle", { count: plan.poeCount })}
              </div>
              <div style={{ fontFamily: T.font, fontSize: 12, color: T.muted, marginTop: 5 }}>
                {t("weeklyQuiz.poeSectionDesc")}
              </div>
            </div>
          )}
          {plan.newArticles.length > 0 && (
            <div>
              <div style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.09em", color: T.faint, marginBottom: 8 }}>
                {t("weeklyQuiz.newSectionTitle", { count: plan.newCount }).toUpperCase()}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {plan.newArticles.map(a => (
                  <span key={a.id} style={{ padding: "5px 10px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, fontFamily: T.font, fontSize: 12, color: T.text }}>
                    Art. {Number(a.number)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {plan.retentionArticles.length > 0 && (
            <div>
              <div style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.09em", color: T.faint, marginBottom: 8 }}>
                {t("weeklyQuiz.retentionSectionTitle", { count: plan.retentionCount }).toUpperCase()}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {plan.retentionArticles.map(a => (
                  <span key={a.id} style={{ padding: "5px 10px", background: T.surface, border: `1px solid ${T.wrong}`, borderRadius: 6, fontFamily: T.font, fontSize: 12, color: T.wrong }}>
                    Art. {Number(a.number)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleStart}
            style={{ padding: "14px 0", background: fill.accent, color: fill.onAccent, borderRadius: 8, fontFamily: T.font, fontSize: 15, fontWeight: 700, border: 0, cursor: "pointer" }}
          >
            {t("weeklyQuiz.startQuiz")}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "results") {
    const newAnswers = answered.filter(a => a.q._source === "new");
    const retentionAnswers = answered.filter(a => a.q._source === "retention");
    const newScore = newAnswers.length ? Math.round((newAnswers.filter(a => a.correct).length / newAnswers.length) * 100) : null;
    const retentionScore = retentionAnswers.length ? Math.round((retentionAnswers.filter(a => a.correct).length / retentionAnswers.length) * 100) : null;
    const prior = history.length > 0 ? history[history.length - 1] : null;

    return (
      <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font }}>
        <div style={{ background: T.panelAlt, padding: "52px 20px 20px", borderBottom: `1px solid ${T.border}`, textAlign: "center" }}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text }}>
            {t("weeklyQuiz.resultsTitle", { week: plan?.weekNumber })}
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.09em", color: T.faint, marginTop: 8 }}>
            {answered.filter(a => a.correct).length} / {answered.length} CORRECT
          </div>
        </div>
        <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {newScore !== null && (
              <div style={{ flex: 1, padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                <div style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", color: T.faint, marginBottom: 8 }}>{t("weeklyQuiz.newMaterial").toUpperCase()}</div>
                <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: newScore >= 80 ? fill.accent : newScore >= 60 ? fill.attention : fill.wrong }}>{newScore}%</div>
                {prior && (
                  <div style={{ fontFamily: T.fontMono, fontSize: 10, color: newScore >= Number(prior.newScore) ? fill.accent : fill.wrong, marginTop: 4 }}>
                    {t(newScore >= Number(prior.newScore) ? "weeklyQuiz.vsLastWeekUp" : "weeklyQuiz.vsLastWeekDown", { score: Number(prior.newScore) })}
                  </div>
                )}
              </div>
            )}
            {retentionScore !== null && (
              <div style={{ flex: 1, padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                <div style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", color: T.faint, marginBottom: 8 }}>{t("weeklyQuiz.retention").toUpperCase()}</div>
                <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: retentionScore >= 80 ? fill.accent : retentionScore >= 60 ? fill.attention : fill.wrong }}>{retentionScore}%</div>
                {prior && (
                  <div style={{ fontFamily: T.fontMono, fontSize: 10, color: retentionScore >= Number(prior.retentionScore) ? fill.accent : fill.wrong, marginTop: 4 }}>
                    {t(retentionScore >= Number(prior.retentionScore) ? "weeklyQuiz.vsLastWeekUp" : "weeklyQuiz.vsLastWeekDown", { score: Number(prior.retentionScore) })}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => navigate("/home")}
            style={{ padding: "14px 0", background: fill.accent, color: fill.onAccent, borderRadius: 8, fontFamily: T.font, fontSize: 15, fontWeight: 700, border: 0, cursor: "pointer" }}
          >{t("addFriend.backToHome")}</button>
        </div>
      </div>
    );
  }

  if (!currentQ) return null;

  const revealed   = chosen !== null;
  const correct    = revealed && chosen === currentQ.correctId;
  const ringColor  = revealed ? T.border : T.attention;
  const sourceTag  = currentQ._source === "new" ? "NEW MATERIAL" : currentQ._source === "poe" ? "POE" : "RETENTION";
  const articleTag = currentQ.articleId.split(":")[1]?.toUpperCase() ?? "QUIZ";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", background: T.bg, fontFamily: T.font }}>
      {/* Header: back + title + progress dots */}
      <div style={{ padding: "52px 16px 14px", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${T.border}` }}>
        <button
          onClick={() => navigate(-1)}
          style={{ color: T.text, fontSize: 22, background: "transparent", border: 0, padding: "0 4px", minHeight: 44, cursor: "pointer" }}
        >‹</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 14, color: T.text, lineHeight: 1.2 }}>
            {t("weeklyQuiz.weekTitle", { week: plan?.weekNumber ?? "" })} quiz
          </div>
          <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.08em", color: T.faint, marginTop: 4 }}>
            QUESTION {currentIdx + 1} OF {questions.length}
          </div>
        </div>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 3 }}>
          {questions.map((_, i) => {
            const a = answered[i];
            const isCurrent = i === currentIdx;
            let bg = T.border;
            if (a)        bg = a.correct ? fill.accent : fill.wrong;
            else if (isCurrent) bg = T.text;
            return <div key={i} style={{ width: 12, height: 4, borderRadius: 2, background: bg }} />;
          })}
        </div>
      </div>

      {/* Question + ring timer */}
      <div style={{ padding: "16px 16px 0", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: fill.accent }}>
              {sourceTag} · {articleTag}
            </div>
            <p style={{ fontFamily: T.font, fontWeight: 400, fontSize: 16, lineHeight: 1.55, color: T.text, margin: "12px 0 0" }}>
              {currentQ.stem}
            </p>
          </div>
          {/* Ring timer */}
          <div style={{
            width: 54, height: 54, flexShrink: 0, borderRadius: 27,
            border: `3px solid ${ringColor}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 20, color: T.text,
          }}>
            {timeLeft}
          </div>
        </div>

        {/* Choices */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 22 }}>
          {currentQ.choices.map((c) => {
            const isPick = c.id === chosen;
            const isCorrect = c.id === currentQ.correctId;
            let bg = T.surface;
            let border = T.border;
            let keyColor = T.faint;
            let mark = "";
            let markColor = T.faint;
            if (revealed) {
              if (isPick && isCorrect)  { bg = tint.dark.accent;   border = fill.accent; keyColor = fill.accent; mark = "YOUR CALL ✓"; markColor = fill.accent; }
              else if (isPick)          { bg = tint.dark.wrong;    border = fill.wrong;  keyColor = fill.wrong;  mark = "YOUR CALL ✗"; markColor = fill.wrong; }
              else if (isCorrect)       { bg = "rgba(120,200,150,0.09)"; border = "rgba(120,200,150,0.45)"; keyColor = fill.accent; mark = "CORRECT"; markColor = fill.accent; }
            }
            return (
              <button
                key={c.id}
                disabled={revealed}
                onClick={() => handleChoice(c.id)}
                style={{
                  padding: "14px 16px", background: bg, border: `1px solid ${border}`,
                  borderRadius: 10, textAlign: "left",
                  fontFamily: T.font, fontSize: 14.5, lineHeight: 1.35, color: T.text,
                  display: "flex", gap: 12, alignItems: "center", minHeight: 52, cursor: revealed ? "default" : "pointer",
                }}
              >
                <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 12, minWidth: 16, color: keyColor }}>
                  {c.id.toUpperCase()}
                </span>
                <span style={{ flex: 1 }}>{c.text}</span>
                {mark && (
                  <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10.5, color: markColor, whiteSpace: "nowrap" }}>
                    {mark}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Reveal panel */}
        {revealed && (
          <div style={{ marginTop: 18, borderRadius: 10, overflow: "hidden", border: `1px solid ${T.border}` }}>
            <div style={{
              padding: "11px 16px", background: correct ? fill.accent : fill.wrong,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
              <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 14, letterSpacing: "0.07em", textTransform: "uppercase", color: fill.onAccent }}>
                {correct ? "Correct call" : "Missed call"}
              </span>
              <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, color: "rgba(13,16,18,0.6)" }}>
                {correct ? "68% OF OFFICIALS AGREE" : "ONLY 32% GET THIS ONE"}
              </span>
            </div>
            <div style={{ padding: "14px 16px", background: T.surface }}>
              {currentQ.citation && (
                <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: fill.accent }}>
                  {currentQ.citation.toUpperCase()}
                </div>
              )}
              <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13.5, lineHeight: 1.6, color: T.muted, marginTop: currentQ.citation ? 9 : 0 }}>
                {currentQ.explanation}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ padding: 16, display: "flex", gap: 9 }}>
        <button
          disabled={!revealed}
          onClick={handleNext}
          style={{
            flex: 1, padding: "14px 0",
            background: revealed ? fill.accent : T.surface,
            color: revealed ? fill.onAccent : T.faint,
            border: revealed ? 0 : `1px solid ${T.border}`,
            borderRadius: 8, fontFamily: T.font, fontSize: 15, fontWeight: 600, minHeight: 48, cursor: revealed ? "pointer" : "default",
          }}
        >
          {currentIdx + 1 >= questions.length ? t("challenge.finish") : t("challenge.nextQuestion")}
        </button>
        {revealed && (
          <button
            style={{ padding: "0 18px", background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.font, fontWeight: 600, fontSize: 13, minHeight: 48, cursor: "pointer" }}
          >
            Save rule
          </button>
        )}
      </div>
    </div>
  );
}
