import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { contentService, type Article } from "../services/content";
import { questionService, type Question } from "../services/question";
import { userService, type MonthlyQuizResult } from "../services/user";
import { rankingService } from "../services/ranking";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";

const TOTAL_QUESTIONS = 50;
const CASEBOOK_RATIO = 0.4;
const DEFAULT_SEC_PER_Q = 45;

function monthKeyUTC(d: Date): number {
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}
function daysInMonthUTC(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}
export function isInLastFiveDaysOfMonth(d: Date): boolean {
  return d.getUTCDate() >= daysInMonthUTC(d) - 4;
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function sampleProportional(sportId: string, articleIds: string[], casebook: boolean, totalCount: number): Promise<Question[]> {
  if (articleIds.length === 0 || totalCount === 0) return [];
  const perArticle = Math.max(1, Math.ceil(totalCount / articleIds.length));
  const results = await Promise.all(articleIds.map(id =>
    questionService.sampleQuiz({ sportId, articleIds: [id], casebook, difficulty: [], count: BigInt(perArticle) })
  ));
  return shuffle(results.flat()).slice(0, totalCount);
}

export default function MonthlyQuizPage() {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuthStore();
  const { sportId, levelId } = useSport();

  const [phase, setPhase] = useState<"loading" | "locked" | "preview" | "quiz" | "results" | "error" | "empty">("loading");
  const [error, setError] = useState<string | null>(null);
  const [opensOn, setOpensOn] = useState<string | null>(null);
  const [articleCount, setArticleCount] = useState(0);
  const [history, setHistory] = useState<MonthlyQuizResult[]>([]);
  const [secPerQ, setSecPerQ] = useState(DEFAULT_SEC_PER_Q);
  const [articlesById, setArticlesById] = useState<Record<string, Article>>({});
  const [coverageIds, setCoverageIds] = useState<string[]>([]);

  const [questions,  setQuestions]  = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [chosen,     setChosen]     = useState<string | null>(null);
  const [timeLeft,   setTimeLeft]   = useState(DEFAULT_SEC_PER_Q);
  const [answered,   setAnswered]   = useState<{ q: Question; correct: boolean }[]>([]);

  useEffect(() => {
    if (!isAuthenticated) { setPhase("error"); setError("Sign in to take your monthly exam."); return; }

    const now = new Date();
    if (!isInLastFiveDaysOfMonth(now)) {
      const daysLeft = daysInMonthUTC(now);
      const opensAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), daysLeft - 4));
      setOpensOn(opensAt.toLocaleDateString(undefined, { month: "long", day: "numeric" }));
      setPhase("locked");
      return;
    }

    (async () => {
      const [arts, progress, hist] = await Promise.all([
        contentService.listArticles(sportId, levelId),
        userService.getMyProgress(),
        userService.getMonthlyQuizHistory(),
      ]);
      const sorted = [...arts].sort((a, b) => Number(a.number) - Number(b.number));
      setArticlesById(Object.fromEntries(sorted.map(a => [a.id, a])));
      setHistory(hist);

      const studiedIds = progress.filter(p => Number(p.timesStudied) > 0).map(p => p.articleId);
      const coverage = studiedIds.length > 0 ? studiedIds : sorted.map(a => a.id);
      setArticleCount(coverage.length);
      if (coverage.length === 0) { setPhase("empty"); return; }

      setCoverageIds(coverage);
      setPhase("preview");
    })().catch(() => { setPhase("error"); setError("Couldn't load your monthly exam."); });
  }, [isAuthenticated, sportId, levelId]);

  async function handleStart() {
    setPhase("loading");
    try {
      const casebookCount = Math.round(TOTAL_QUESTIONS * CASEBOOK_RATIO);
      const regularCount = TOTAL_QUESTIONS - casebookCount;
      const [regularQs, casebookQs] = await Promise.all([
        sampleProportional(sportId, coverageIds, false, regularCount),
        sampleProportional(sportId, coverageIds, true, casebookCount),
      ]);
      const all = shuffle([...regularQs, ...casebookQs]);
      if (all.length === 0) { setPhase("empty"); return; }
      setQuestions(all);
      setCurrentIdx(0);
      setAnswered([]);
      setChosen(null);
      setTimeLeft(secPerQ);
      setPhase("quiz");
    } catch {
      setError("Couldn't build your exam — try again.");
      setPhase("error");
    }
  }

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
      setTimeLeft(secPerQ);
      return;
    }

    const overallScore = Math.round((updated.filter(a => a.correct).length / updated.length) * 100);
    const byArticle = new Map<string, { correct: number; total: number }>();
    updated.forEach(({ q, correct }) => {
      const b = byArticle.get(q.articleId) ?? { correct: 0, total: 0 };
      b.total += 1;
      if (correct) b.correct += 1;
      byArticle.set(q.articleId, b);
    });
    const articleScores: [string, number][] = [...byArticle.entries()].map(([id, b]) => [id, Math.round((b.correct / b.total) * 100)]);

    await Promise.all([...byArticle.entries()].map(([articleId, b]) =>
      userService.recordArticleStudied(articleId, Math.round((b.correct / b.total) * 100)).catch(() => {})
    ));
    await userService.recordMonthlyQuizResult(monthKeyUTC(new Date()), overallScore, articleScores).catch(() => {});
    if (profile) {
      await rankingService.recordExamResult(
        overallScore, updated.length, profile.displayName, profile.sport, profile.state || "TX", secPerQ,
      ).catch(() => {});
    }

    setPhase("results");
  }, [currentQ, chosen, answered, currentIdx, questions.length, secPerQ, profile]);

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

  if (phase === "locked") {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Monthly exam isn't open yet</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
          It opens in the last 5 days of the month — check back on {opensOn}.
        </div>
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
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Nothing to review yet</div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
          Study a few articles this month, then come back for your comprehensive exam.
        </div>
        <button onClick={() => navigate("/home")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          Back to Home
        </button>
      </div>
    );
  }

  if (phase === "preview") {
    return (
      <div>
        <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Monthly Comprehensive Exam</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
            {TOTAL_QUESTIONS} questions across {articleCount} article{articleCount === 1 ? "" : "s"} you've studied
          </div>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: "12px 14px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.muted }}>
            {Math.round(TOTAL_QUESTIONS * (1 - CASEBOOK_RATIO))} rule questions + {Math.round(TOTAL_QUESTIONS * CASEBOOK_RATIO)} casebook plays,
            spread proportionally across every article you've studied.
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14 }}>Time per question</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => setSecPerQ(s => Math.max(15, s - 15))}
                style={{ width: 28, height: 28, borderRadius: 6, background: T.bg, border: `1px solid ${T.border}`, fontSize: 16 }}
              >−</button>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.red, minWidth: 60, textAlign: "center" }}>{secPerQ} sec</span>
              <button
                onClick={() => setSecPerQ(s => Math.min(120, s + 15))}
                style={{ width: 28, height: 28, borderRadius: 6, background: T.bg, border: `1px solid ${T.border}`, fontSize: 16 }}
              >+</button>
            </div>
          </div>

          <button
            onClick={handleStart}
            style={{ padding: "14px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
          >
            Start Exam
          </button>
        </div>
      </div>
    );
  }

  if (phase === "results") {
    const overallScore = Math.round((answered.filter(a => a.correct).length / answered.length) * 100);
    const thisMonth = monthKeyUTC(new Date());
    const priorEntries = history.filter(h => Number(h.month) !== thisMonth);
    const prior = priorEntries.length > 0 ? priorEntries[priorEntries.length - 1] : null;
    const delta = prior ? overallScore - Number(prior.score) : null;

    const byArticle = new Map<string, { correct: number; total: number }>();
    answered.forEach(({ q, correct }) => {
      const b = byArticle.get(q.articleId) ?? { correct: 0, total: 0 };
      b.total += 1;
      if (correct) b.correct += 1;
      byArticle.set(q.articleId, b);
    });
    const priorScores = new Map((prior?.articleScores ?? []).map(([id, s]) => [id, Number(s)]));
    const breakdown = [...byArticle.entries()].map(([id, b]) => {
      const score = Math.round((b.correct / b.total) * 100);
      const priorScore = priorScores.get(id) ?? null;
      return { id, score, priorScore, trend: priorScore === null ? "new" as const : score > priorScore ? "up" as const : score < priorScore ? "down" as const : "flat" as const };
    }).sort((a, b) => a.score - b.score);

    return (
      <div style={{ padding: "24px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎓</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Monthly Exam Complete!</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: T.navy, marginBottom: 4 }}>{overallScore}%</div>
        {delta !== null && (
          <div style={{ fontSize: 13, color: delta >= 0 ? T.correct : T.wrong, marginBottom: 20 }}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} point{Math.abs(delta) === 1 ? "" : "s"} {delta >= 0 ? "up from" : "down from"} last month
          </div>
        )}
        {delta === null && <div style={{ fontSize: 12, color: T.muted, marginBottom: 20 }}>Trend appears after your second month.</div>}

        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 8 }}>ARTICLE BREAKDOWN</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
            {breakdown.map(({ id, score, trend }) => {
              const weak = score < 70;
              return (
                <div key={id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  background: weak ? "#FDECEA" : T.surface, border: `1px solid ${weak ? T.wrong : T.border}`, borderRadius: 8, fontSize: 13,
                }}>
                  <span style={{ flex: 1, textAlign: "left" }}>
                    Art. {articlesById[id] ? Number(articlesById[id].number) : "?"}
                  </span>
                  <span style={{ fontWeight: 700, color: weak ? T.wrong : T.text }}>{score}%</span>
                  <span style={{ fontSize: 12, color: trend === "up" ? T.correct : trend === "down" ? T.wrong : T.muted, minWidth: 16 }}>
                    {trend === "up" ? "▲" : trend === "down" ? "▼" : trend === "new" ? "•" : "—"}
                  </span>
                  {weak && (
                    <button
                      onClick={() => navigate(`/quiz/${id}`)}
                      style={{ fontSize: 11, fontWeight: 700, color: T.wrong, background: "transparent" }}
                    >
                      Study now
                    </button>
                  )}
                </div>
              );
            })}
          </div>
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
  const timerPct = (timeLeft / secPerQ) * 100;

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
        <div style={{ fontSize: 12, color: currentQ.isCasebook ? T.wrong : T.red, fontWeight: 600, marginBottom: 8 }}>
          {currentQ.isCasebook ? "CASEBOOK" : "RULE"} · {currentQ.articleId.split(":")[1]?.toUpperCase() ?? "QUIZ"}
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
