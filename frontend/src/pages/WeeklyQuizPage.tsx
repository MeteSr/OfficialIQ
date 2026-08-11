import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { contentService, type Article } from "../services/content";
import { questionService, type Question } from "../services/question";
import { userService, type WeeklyQuizResult } from "../services/user";
import { rankingService } from "../services/ranking";
import { useAuthStore } from "../store/authStore";

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
  const { isAuthenticated, profile } = useAuthStore();

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
    if (!isAuthenticated) { setPhase("error"); setError("Sign in to take your weekly quiz."); return; }

    (async () => {
      const arts = await contentService.listArticles("ncaa_basketball", "varsity");
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
    })().catch(() => { setPhase("error"); setError("Couldn't load your weekly quiz."); });
  }, [isAuthenticated]);

  async function handleStart() {
    if (!plan) return;
    setPhase("loading");
    try {
      const [newQs, retentionQs, poePool] = await Promise.all([
        plan.newCount > 0
          ? questionService.sampleQuiz({
              sportId: "ncaa_basketball", articleIds: plan.newArticles.map(a => a.id),
              casebook: false, difficulty: [], count: BigInt(plan.newCount),
            })
          : Promise.resolve([]),
        plan.retentionCount > 0
          ? questionService.sampleQuiz({
              sportId: "ncaa_basketball", articleIds: plan.retentionArticles.map(a => a.id),
              casebook: false, difficulty: [], count: BigInt(plan.retentionCount),
            })
          : Promise.resolve([]),
        plan.poeCount > 0
          ? Promise.all([
              questionService.sampleQuiz({ sportId: "ncaa_basketball", articleIds: plan.poeArticleIds, casebook: false, difficulty: [], count: 50n }),
              questionService.sampleQuiz({ sportId: "ncaa_basketball", articleIds: plan.poeArticleIds, casebook: true,  difficulty: [], count: 50n }),
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
      setError("Couldn't build your quiz — try again.");
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
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>Loading…</div>;
  }

  if (phase === "error") {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{error}</div>
        <button onClick={() => navigate("/home")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          Back to Home
        </button>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No questions available yet</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
          Set a study pace or study a few articles first, then check back.
        </div>
        <button onClick={() => navigate("/home")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          Back to Home
        </button>
      </div>
    );
  }

  if (phase === "preview" && plan) {
    return (
      <div>
        <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Week {plan.weekNumber} Retention Quiz</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
            {plan.newCount} new + {plan.retentionCount} retention{plan.poeCount > 0 ? ` + ${plan.poeCount} points of emphasis` : ""} question{plan.newCount + plan.retentionCount + plan.poeCount === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {plan.poeCount > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.navy, marginBottom: 6 }}>
                📌 POINTS OF EMPHASIS ({plan.poeCount} questions)
              </div>
              <div style={{ fontSize: 12, color: T.muted }}>
                Drawn from this season's officiating points of emphasis.
              </div>
            </div>
          )}
          {plan.newArticles.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6 }}>
                NEW THIS WEEK ({plan.newCount} questions)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {plan.newArticles.map(a => (
                  <span key={a.id} style={{ padding: "5px 10px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12 }}>
                    Art. {Number(a.number)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {plan.retentionArticles.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6 }}>
                RETENTION — YOUR WEAKEST AREAS ({plan.retentionCount} questions)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {plan.retentionArticles.map(a => (
                  <span key={a.id} style={{ padding: "5px 10px", background: "#FDECEA", border: `1px solid ${T.wrong}`, borderRadius: 6, fontSize: 12, color: T.wrong }}>
                    Art. {Number(a.number)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={handleStart}
            style={{ padding: "14px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
          >
            Start Quiz
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
      <div style={{ padding: "24px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Week {plan?.weekNumber} Quiz Complete!</div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {newScore !== null && (
            <div style={{ flex: 1, padding: "14px 0", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>New Material</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.navy }}>{newScore}%</div>
              {prior && (
                <div style={{ fontSize: 11, color: newScore >= prior.newScore ? T.correct : T.wrong, marginTop: 2 }}>
                  {newScore >= prior.newScore ? "▲" : "▼"} vs {Number(prior.newScore)}% last week
                </div>
              )}
            </div>
          )}
          {retentionScore !== null && (
            <div style={{ flex: 1, padding: "14px 0", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>Retention</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: T.navy }}>{retentionScore}%</div>
              {prior && (
                <div style={{ fontSize: 11, color: retentionScore >= prior.retentionScore ? T.correct : T.wrong, marginTop: 2 }}>
                  {retentionScore >= prior.retentionScore ? "▲" : "▼"} vs {Number(prior.retentionScore)}% last week
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
          {answered.filter(a => a.correct).length} / {answered.length} correct overall
        </div>

        <button
          onClick={() => navigate("/home")}
          style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
        >Back to Home</button>
      </div>
    );
  }

  if (!currentQ) return null;

  const revealed = chosen !== null;
  const timerPct = (timeLeft / SECONDS_PER_Q) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div style={{ background: T.navy, padding: "52px 16px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{ color: T.white, fontSize: 22, background: "transparent" }}>‹</button>
        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${timerPct}%`, background: T.red, transition: "width 1s linear" }} />
        </div>
        <span style={{ color: T.white, fontSize: 12, minWidth: 24, textAlign: "right" }}>{timeLeft}s</span>
        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{currentIdx + 1}/{questions.length}</span>
      </div>

      <div style={{ padding: "16px 16px 0", flex: 1 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, marginBottom: 8,
          color: currentQ._source === "new" ? T.red : currentQ._source === "poe" ? T.navy : T.wrong,
        }}>
          {currentQ._source === "new" ? "NEW" : currentQ._source === "poe" ? "📌 POINT OF EMPHASIS" : "RETENTION"} · {currentQ.articleId.split(":")[1]?.toUpperCase() ?? "QUIZ"}
        </div>
        <p style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.5, marginBottom: 20 }}>{currentQ.stem}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {currentQ.choices.map((c) => {
            let bg = T.surface, border = T.border, color = T.text;
            if (revealed) {
              if (c.id === currentQ.correctId)  { bg = "#E6F4EC"; border = T.correct; color = T.correct; }
              else if (c.id === chosen)          { bg = "#FDECEA"; border = T.wrong;   color = T.wrong; }
            }
            return (
              <button
                key={c.id}
                disabled={revealed}
                onClick={() => handleChoice(c.id)}
                style={{
                  padding: "13px 16px", background: bg, border: `2px solid ${border}`,
                  borderRadius: 8, textAlign: "left", fontSize: 14, color, fontWeight: 400,
                  display: "flex", gap: 10, alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 18, color: revealed && c.id === currentQ.correctId ? T.correct : T.muted }}>
                  {c.id.toUpperCase()}.
                </span>
                {c.text}
                {revealed && c.id === currentQ.correctId && <span style={{ marginLeft: "auto" }}>✓</span>}
              </button>
            );
          })}
        </div>

        {revealed && (
          <div style={{
            marginTop: 16, padding: "12px 14px",
            background: "#E6F4EC", border: `1px solid ${T.correct}`,
            borderRadius: 8, fontSize: 13, color: T.correct,
          }}>
            <strong>Correct</strong> — {currentQ.citation}: {currentQ.explanation}
          </div>
        )}
      </div>

      <div style={{ padding: 16 }}>
        <button
          disabled={!revealed}
          onClick={handleNext}
          style={{
            width: "100%", padding: "14px 0",
            background: revealed ? T.navy : T.border,
            color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700,
          }}
        >
          {currentIdx + 1 >= questions.length ? "Finish →" : "Next Question →"}
        </button>
      </div>
    </div>
  );
}
