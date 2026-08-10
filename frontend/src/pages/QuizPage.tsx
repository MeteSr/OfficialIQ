import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { T } from "../tokens";
import { questionService, type Question } from "../services/question";
import { examService } from "../services/exam";
import { rankingService } from "../services/ranking";
import { userService } from "../services/user";
import { useQuizStore, selectCurrentQuestion, selectScore } from "../store/quizStore";
import { useAuthStore } from "../store/authStore";
import type { AnswerRecord } from "../services/exam";

const DEFAULT_SECONDS_PER_Q = 45;

type NavState = { sessionId?: string; questionIds?: string[]; secPerQ?: number } | null;

export default function QuizPage() {
  const { articleId, token } = useParams<{ articleId?: string; token?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navState = location.state as NavState;
  const navigate = useNavigate();
  const { profile, principal } = useAuthStore();

  const {
    questions, currentIdx, isComplete, answers,
    loadQuestions, recordAnswer, advance, reset,
  } = useQuizStore();
  const currentQ  = useQuizStore(selectCurrentQuestion);
  const finalScore = useQuizStore(selectScore);

  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [chosen,       setChosen]       = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_SECONDS_PER_Q);
  const [timeLeft,     setTimeLeft]     = useState(DEFAULT_SECONDS_PER_Q);
  const [sessionId,    setSessionId]    = useState<string | null>(null);
  const [canSubmit,    setCanSubmit]    = useState(true);

  // Load questions for this quiz — three possible entry paths:
  //  1. /quiz/share/:token   — resolve the shared ExamSession and its exact questions
  //  2. /quiz/:articleId with router state — pre-built session from ExamPage (Solo/Timed)
  //  3. /quiz/:articleId with no state — self-generate (e.g. from StudyPage)
  useEffect(() => {
    reset();
    setLoading(true);
    setError(null);

    async function fetchQuestions(ids: string[]): Promise<Question[]> {
      const qs = await Promise.all(ids.map(id => questionService.getQuestion(id)));
      return qs.filter((q): q is Question => q !== null);
    }

    async function load() {
      if (token) {
        const session = await examService.getByShareToken(token);
        if (!session) { setError("This exam link is invalid or has expired."); return; }
        const qs = await fetchQuestions(session.questionIds);
        loadQuestions(qs, session.id);
        setSessionId(session.id);
        setTimerSeconds(Number(session.config.secPerQ) || DEFAULT_SECONDS_PER_Q);
        setCanSubmit(!!principal && session.owner.toString() === principal);
        return;
      }

      if (navState?.sessionId && navState.questionIds) {
        const qs = await fetchQuestions(navState.questionIds);
        loadQuestions(qs, navState.sessionId);
        setSessionId(navState.sessionId);
        setTimerSeconds(navState.secPerQ ?? DEFAULT_SECONDS_PER_Q);
        setCanSubmit(true);
        return;
      }

      const secFromQuery = Number(searchParams.get("sec")) || DEFAULT_SECONDS_PER_Q;
      const qs = await questionService.sampleQuiz({
        sportId:    "ncaa_basketball",
        articleIds: articleId ? [articleId] : [],
        casebook:   true,
        difficulty: [],
        count:      BigInt(25),
      });
      const session = await examService.createSession(
        { sportId: "ncaa_basketball", articleIds: articleId ? [articleId] : [], casebook: true,
          count: BigInt(qs.length), secPerQ: BigInt(secFromQuery), mode: { Solo: null } },
        qs.map(q => q.id),
      );
      loadQuestions(qs, session.id);
      setSessionId(session.id);
      setTimerSeconds(secFromQuery);
      setCanSubmit(true);
    }

    load()
      .catch(() => setError("Failed to load this quiz."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, token]);

  // Reset chosen + timer on question change (or once the real timerSeconds is known)
  useEffect(() => {
    setChosen(null);
    setTimeLeft(timerSeconds);
  }, [currentIdx, timerSeconds]);

  // Countdown timer
  useEffect(() => {
    if (chosen !== null || isComplete || loading) return;
    if (timeLeft === 0) { setChosen("__timeout__"); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, chosen, isComplete, loading]);

  const handleChoice = useCallback((choiceId: string) => {
    if (chosen !== null || !currentQ) return;
    setChosen(choiceId);
    const ans: AnswerRecord = {
      questionId: currentQ.id,
      chosenId:   choiceId,
      isCorrect:  choiceId === currentQ.correctId,
      elapsedSec: BigInt(timerSeconds - timeLeft),
    };
    recordAnswer(ans);
  }, [chosen, currentQ, timeLeft, timerSeconds]);

  const handleNext = useCallback(async () => {
    advance();
    if (currentIdx + 1 >= questions.length && sessionId) {
      const finalAnswers = [...answers, ...(chosen && currentQ ? [{
        questionId: currentQ.id, chosenId: chosen,
        isCorrect: chosen === currentQ.correctId, elapsedSec: BigInt(timerSeconds - timeLeft),
      }] : [])];
      const avgElapsedSec = finalAnswers.length
        ? Number(finalAnswers.reduce((sum, a) => sum + a.elapsedSec, 0n)) / finalAnswers.length
        : 0;
      // Only the session owner can record answers against the shared ExamSession
      // (a non-owner opening a share link still gets ranked, just not written
      // into the owner's session record).
      if (canSubmit) {
        await examService.submitExam(sessionId, finalAnswers).catch(() => {});
      }
      if (profile) {
        await rankingService.recordExamResult(
          finalScore, questions.length,
          profile.displayName, profile.sport, profile.state || "TX",
          avgElapsedSec,
        ).catch(() => {});

        // Attribute progress per-article (a session can span several
        // articles), scored by that article's own accuracy within this quiz.
        const byArticle = new Map<string, { correct: number; total: number }>();
        finalAnswers.forEach((a, i) => {
          const articleId = questions[i]?.articleId;
          if (!articleId) return;
          const bucket = byArticle.get(articleId) ?? { correct: 0, total: 0 };
          bucket.total += 1;
          if (a.isCorrect) bucket.correct += 1;
          byArticle.set(articleId, bucket);
        });
        await Promise.all([...byArticle.entries()].map(([articleId, b]) =>
          userService.recordArticleStudied(articleId, Math.round((b.correct / b.total) * 100)).catch(() => {})
        ));
      }
    }
  }, [advance, currentIdx, questions, sessionId, answers, chosen, currentQ, timeLeft, timerSeconds, finalScore, profile, canSubmit]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>
        Loading questions…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{error}</div>
        <button
          onClick={() => navigate("/home")}
          style={{
            padding: "13px 32px", background: T.navy, color: T.white,
            borderRadius: 8, fontSize: 15, fontWeight: 700,
          }}
        >Back to Home</button>
      </div>
    );
  }

  if (isComplete) {
    const avgElapsed = answers.length
      ? Math.round(Number(answers.reduce((sum, a) => sum + a.elapsedSec, 0n)) / answers.length)
      : 0;
    return (
      <div style={{ padding: "24px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Quiz Complete!</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: T.navy, marginBottom: 4 }}>
          {finalScore}%
        </div>
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 4 }}>
          {answers.filter(a => a.isCorrect).length} / {questions.length} correct
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
          Avg. {avgElapsed}s per question
        </div>

        <div style={{ textAlign: "left", marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>
            Per-question breakdown
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {answers.map((a, i) => (
              <div
                key={a.questionId + i}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", background: T.surface,
                  border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13,
                }}
              >
                <span style={{ color: T.muted, minWidth: 20 }}>{i + 1}.</span>
                <span style={{
                  color: a.isCorrect ? T.correct : T.wrong, fontWeight: 700, minWidth: 18,
                }}>
                  {a.isCorrect ? "✓" : "✗"}
                </span>
                <span style={{ flex: 1, color: T.muted, textAlign: "left" }}>
                  {questions[i]?.stem.slice(0, 48) ?? a.questionId}{(questions[i]?.stem.length ?? 0) > 48 ? "…" : ""}
                </span>
                <span style={{ color: T.text, fontWeight: 600 }}>{Number(a.elapsedSec)}s</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => navigate("/home")}
          style={{
            padding: "13px 32px", background: T.navy, color: T.white,
            borderRadius: 8, fontSize: 15, fontWeight: 700,
          }}
        >Back to Home</button>
      </div>
    );
  }

  if (!currentQ) return null;

  const revealed   = chosen !== null;
  const timerPct   = (timeLeft / timerSeconds) * 100;
  const total      = questions.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      {/* Header */}
      <div style={{ background: T.navy, padding: "52px 16px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => navigate(-1)} style={{ color: T.white, fontSize: 22, background: "transparent" }}>‹</button>
        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${timerPct}%`, background: T.red, transition: "width 1s linear" }} />
        </div>
        <span style={{ color: T.white, fontSize: 12, minWidth: 36, textAlign: "right" }}>
          {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:{String(timeLeft % 60).padStart(2, "0")}
        </span>
        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{currentIdx + 1}/{total}</span>
      </div>

      <div style={{ padding: "16px 16px 0", flex: 1 }}>
        <div style={{ fontSize: 12, color: T.red, fontWeight: 600, marginBottom: 8 }}>
          {currentQ.articleId.split(":")[1]?.toUpperCase() ?? "QUIZ"}
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
            color: T.white, borderRadius: 8,
            fontSize: 15, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {currentIdx + 1 >= total ? "Finish →" : "Next Question →"}
        </button>
      </div>
    </div>
  );
}
