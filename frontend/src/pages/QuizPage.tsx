import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { T } from "../tokens";
import { questionService, type Question, type UserQuestionHistory } from "../services/question";
import { examService } from "../services/exam";
import { rankingService } from "../services/ranking";
import { userService } from "../services/user";
import { contentService, type CasebookPlay } from "../services/content";
import CourtDiagram from "../components/CourtDiagram";
import VideoPlayer from "../components/VideoPlayer";
import { useQuizStore, selectCurrentQuestion, selectScore } from "../store/quizStore";
import { useAuthStore } from "../store/authStore";
import type { AnswerRecord, ExamConfig } from "../services/exam";
import { enqueuePendingAction } from "../lib/offlineDb";
import ShareWithMentorButton from "../components/ShareWithMentorButton";
import { associationService } from "../services/association";

const DEFAULT_SECONDS_PER_Q = 45;

type NavState = {
  sessionId?: string; questionIds?: string[]; secPerQ?: number;
  assignmentId?: string; articleIds?: string[]; casebook?: boolean;
} | null;

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
  const [offlineExamConfig, setOfflineExamConfig] = useState<ExamConfig | null>(null);
  const [history, setHistory] = useState<(UserQuestionHistory | null)[]>([]);
  const [playsCache, setPlaysCache] = useState<Record<string, CasebookPlay[]>>({});
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [videoWatched, setVideoWatched] = useState(false);

  const isAdaptive = searchParams.get("adaptive") === "1";

  // Casebook video (issue #21) — the question can't be answered until the
  // clip has played through once. Derived here (not just in the render
  // body) so handleChoice and the countdown timer can gate on it too.
  const currentPlay = currentQ?.isCasebook
    ? (playsCache[currentQ.articleId] ?? []).find(p => p.citation === currentQ.citation) ?? null
    : null;
  const hasVideo = !!(currentPlay && currentPlay.videoUrl.length);

  // Load questions for this quiz — three possible entry paths:
  //  1. /quiz/share/:token   — resolve the shared ExamSession and its exact questions
  //  2. /quiz/:articleId with router state — pre-built session from ExamPage (Solo/Timed)
  //  3. /quiz/:articleId with no state — self-generate (e.g. from StudyPage)
  useEffect(() => {
    reset();
    setLoading(true);
    setError(null);
    setOfflineExamConfig(null);
    setAssignmentId(navState?.assignmentId ?? null);

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
      const countFromQuery = Number(searchParams.get("count")) || 25;
      // An assignment from a coordinator (see AssociationDetailPage) carries
      // its own article set + casebook flag via router state; otherwise this
      // is a single-article self-generated quiz from StudyPage.
      const assignedArticleIds = navState?.articleIds;
      const effectiveArticleIds = assignedArticleIds ?? (articleId ? [articleId] : []);
      const effectiveCasebook = navState?.casebook ?? true;
      const quizFilter = {
        sportId:    "ncaa_basketball",
        articleIds: effectiveArticleIds,
        casebook:   effectiveCasebook,
        difficulty: [] as [],
        count:      BigInt(countFromQuery),
      };
      // Both fall back to the IndexedDB content cache when the canister is
      // unreachable, so this can succeed offline too.
      const qs = isAdaptive && principal
        ? await questionService.getAdaptiveQuiz(quizFilter)
        : await questionService.sampleQuiz(quizFilter);
      if (qs.length === 0) { setError("No cached questions available for this article yet — connect once to download content."); return; }

      const config: ExamConfig = {
        sportId: "ncaa_basketball", articleIds: effectiveArticleIds, casebook: effectiveCasebook,
        count: BigInt(qs.length), secPerQ: BigInt(secFromQuery), mode: { Solo: null },
      };
      try {
        const session = await examService.createSession(config, qs.map(q => q.id));
        loadQuestions(qs, session.id);
        setSessionId(session.id);
        setCanSubmit(true);
      } catch {
        // Offline (or the canister is otherwise unreachable): still let the
        // user take the quiz from cached questions. handleNext queues the
        // create+submit as a single action once we're back online.
        const localSessionId = `offline-${Date.now()}`;
        loadQuestions(qs, localSessionId);
        setSessionId(localSessionId);
        setOfflineExamConfig(config);
        setCanSubmit(false);
      }
      setTimerSeconds(secFromQuery);
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
    setVideoWatched(false);
  }, [currentIdx, timerSeconds]);

  // Spaced-repetition history for the "Why this question?" explainer — best
  // effort, only meaningful once the user is signed in.
  useEffect(() => {
    if (!principal || questions.length === 0) { setHistory([]); return; }
    questionService.getMyHistoryBatch(questions.map(q => q.id)).then(setHistory).catch(() => setHistory([]));
  }, [questions, principal]);

  // Casebook plays (scenario/ruling text + optional court diagram) for the
  // current question's article, fetched once per article and cached.
  useEffect(() => {
    if (!currentQ?.isCasebook || playsCache[currentQ.articleId]) return;
    contentService.listPlays(currentQ.articleId)
      .then(plays => setPlaysCache(prev => ({ ...prev, [currentQ.articleId]: plays })))
      .catch(() => {});
  }, [currentQ?.articleId, currentQ?.isCasebook, playsCache]);

  // Countdown timer — paused while a required casebook clip hasn't been
  // watched through yet, so the clock doesn't burn away during playback.
  useEffect(() => {
    if (chosen !== null || isComplete || loading || (hasVideo && !videoWatched)) return;
    if (timeLeft === 0) { setChosen("__timeout__"); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, chosen, isComplete, loading, hasVideo, videoWatched]);

  const handleChoice = useCallback((choiceId: string) => {
    if (chosen !== null || !currentQ || (hasVideo && !videoWatched)) return;
    setChosen(choiceId);
    const isCorrect = choiceId === currentQ.correctId;
    const ans: AnswerRecord = {
      questionId: currentQ.id,
      chosenId:   choiceId,
      isCorrect,
      elapsedSec: BigInt(timerSeconds - timeLeft),
    };
    recordAnswer(ans);

    if (principal) {
      const questionId = currentQ.id;
      questionService.recordAnswer(questionId, isCorrect).catch(() =>
        enqueuePendingAction({ kind: "recordAnswer", questionId, isCorrect }),
      );
      // Feeds the "Speed Demon" and "Casebook King" badges — best effort,
      // not queued offline since it's a minor cosmetic counter.
      rankingService.recordAnswerSignal(isCorrect, timerSeconds - timeLeft, currentQ.isCasebook).catch(() => {});
    }
  }, [chosen, currentQ, timeLeft, timerSeconds, principal, hasVideo, videoWatched]);

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

      if (offlineExamConfig) {
        // The canister was already known unreachable when this quiz started
        // (see the plain-articleId load path) — queue the full create+submit
        // rather than attempting it now.
        await enqueuePendingAction({
          kind: "offlineExam", config: offlineExamConfig,
          questionIds: questions.map(q => q.id), answers: finalAnswers,
        });
      } else if (canSubmit) {
        // Only the session owner can record answers against the shared ExamSession
        // (a non-owner opening a share link still gets ranked, just not written
        // into the owner's session record).
        await examService.submitExam(sessionId, finalAnswers).catch(() =>
          enqueuePendingAction({ kind: "submitExam", sessionId, answers: finalAnswers })
        );
      }
      if (profile) {
        await rankingService.recordExamResult(
          finalScore, questions.length,
          profile.displayName, profile.sport, profile.state || "TX",
          avgElapsedSec,
        ).catch(() => enqueuePendingAction({
          kind: "recordExamResult", score: finalScore, questionCount: questions.length,
          displayName: profile.displayName, sport: profile.sport, state: profile.state || "TX",
          avgElapsedSec,
        }));
        rankingService.recordQuestionsAnswered(finalAnswers.length).catch(() => {});

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
        await Promise.all([...byArticle.entries()].map(([articleId, b]) => {
          const score = Math.round((b.correct / b.total) * 100);
          return userService.recordArticleStudied(articleId, score).catch(() =>
            enqueuePendingAction({ kind: "recordArticleStudied", articleId, score })
          );
        }));

        if (assignmentId) {
          associationService.recordCompletion(assignmentId, finalScore).catch(() => {});
        }
      }
    }
  }, [advance, currentIdx, questions, sessionId, answers, chosen, currentQ, timeLeft, timerSeconds, finalScore, profile, canSubmit, offlineExamConfig, assignmentId]);

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

        {sessionId && !sessionId.startsWith("offline-") && (
          <ShareWithMentorButton
            examId={sessionId}
            sportId="ncaa_basketball"
            score={finalScore}
            avgElapsedSec={avgElapsed}
            answers={answers.map((a, i) => ({
              questionId: a.questionId, chosenId: a.chosenId,
              correctId: questions[i]?.correctId ?? "", isCorrect: a.isCorrect, elapsedSec: a.elapsedSec,
            }))}
          />
        )}

        <button
          onClick={() => navigate("/home")}
          style={{
            padding: "13px 32px", background: T.navy, color: T.white,
            borderRadius: 8, fontSize: 15, fontWeight: 700, marginTop: 12,
          }}
        >Back to Home</button>
      </div>
    );
  }

  if (!currentQ) return null;

  const revealed   = chosen !== null;
  const timerPct   = (timeLeft / timerSeconds) * 100;
  const total      = questions.length;

  // repetitions === 0 with a prior attempt means the most recent answer
  // reset the SM-2 state, which only happens on a wrong answer.
  const currentHistory = history[currentIdx] ?? null;
  const explainer = (() => {
    if (!currentHistory || currentHistory.timesAnswered === 0n) return null;
    const daysAgo = Math.max(0, Math.floor(
      (Date.now() - Number(currentHistory.lastAnswered / 1_000_000n)) / 86_400_000,
    ));
    const when = daysAgo === 0 ? "today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`;
    return currentHistory.repetitions === 0n
      ? `You last got this wrong ${when}`
      : `You've answered this correctly ${currentHistory.repetitions} time${currentHistory.repetitions === 1n ? "" : "s"} in a row`;
  })();

  const currentPlayDiagram = currentPlay && currentPlay.diagram.length ? currentPlay.diagram[0] : null;
  const videoLocked = hasVideo && !videoWatched;

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
      {offlineExamConfig && (
        <div style={{ background: "#3A2F00", color: "#FFD666", fontSize: 11, fontWeight: 600, padding: "5px 16px", textAlign: "center" }}>
          📡 Offline — your result will sync automatically once you're reconnected
        </div>
      )}

      <div style={{ padding: "16px 16px 0", flex: 1 }}>
        <div style={{ fontSize: 12, color: T.red, fontWeight: 600, marginBottom: 8 }}>
          {currentQ.articleId.split(":")[1]?.toUpperCase() ?? "QUIZ"}
        </div>

        {currentPlay && hasVideo && (
          <VideoPlayer
            key={currentPlay.id}
            src={currentPlay.videoUrl[0]!}
            onFirstPlaythrough={() => setVideoWatched(true)}
          />
        )}

        {currentPlay && (!hasVideo || videoWatched) && (
          <div style={{
            padding: "12px 14px", marginBottom: 14,
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6 }}>
              CASEBOOK · {currentPlay.citation}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}>{currentPlay.scenario}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: T.muted }}>
              <strong style={{ color: T.text }}>Ruling:</strong> {currentPlay.ruling}
            </div>
            {currentPlayDiagram && <CourtDiagram diagram={currentPlayDiagram} />}
          </div>
        )}

        {videoLocked ? (
          <div style={{ padding: "12px 14px", textAlign: "center", color: T.muted, fontSize: 13 }}>
            Watch the play above — the question unlocks once it's finished.
          </div>
        ) : (
          <>
            <p style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.5, marginBottom: explainer ? 8 : 20 }}>{currentQ.stem}</p>
            {explainer && (
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 20, fontStyle: "italic" }}>
                💡 {explainer}
              </div>
            )}

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
          </>
        )}

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
