import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import ReportQuestionButton from "../components/ReportQuestionButton";
import { questionService, type Question, type UserQuestionHistory } from "../services/question";
import { examService, unrevealed } from "../services/exam";
import { rankingService } from "../services/ranking";
import { userService } from "../services/user";
import { contentService, type CasebookPlay } from "../services/content";
import CourtDiagram from "../components/CourtDiagram";
import VideoPlayer from "../components/VideoPlayer";
import { useQuizStore, selectCurrentQuestion, selectScore } from "../store/quizStore";
import { useAuthStore } from "../store/authStore";
import type { ExamConfig } from "../services/exam";
import { enqueuePendingAction } from "../lib/offlineDb";
import { recordAssignmentCompletion } from "../lib/offlineSync";
import ShareWithMentorButton from "../components/ShareWithMentorButton";
import { useSport } from "../lib/sport";

const DEFAULT_SECONDS_PER_Q = 45;

type NavState = {
  assignmentId?: string; articleIds?: string[]; casebook?: boolean;
  mode?: ExamConfig["mode"];
  /** Only questions with this tag, e.g. the season's rule changes (#68). */
  tag?: string;
} | null;

export default function QuizPage() {
  const { articleId, token } = useParams<{ articleId?: string; token?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navState = location.state as NavState;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile, principal } = useAuthStore();
  const { sportId } = useSport();

  const {
    questions, currentIdx, isComplete, answers,
    loadQuestions, recordAnswer, advance, reset, revealQuestion,
  } = useQuizStore();
  const currentQ  = useQuizStore(selectCurrentQuestion);
  const localScore = useQuizStore(selectScore);

  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [chosen,       setChosen]       = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_SECONDS_PER_Q);
  const [timeLeft,     setTimeLeft]     = useState(DEFAULT_SECONDS_PER_Q);
  const [sessionId,    setSessionId]    = useState<string | null>(null);
  // graded: the canister holds the answers and grades each one (ranked).
  // Otherwise this is practice: answers come with the questions, nothing
  // counts toward rankings, assignments or challenges.
  const [graded,       setGraded]       = useState(false);
  const [practiceReason, setPracticeReason] = useState<"offline" | "signedOut" | null>(null);
  const [checking,     setChecking]     = useState(false);
  const [answerError,  setAnswerError]  = useState<string | null>(null);
  const [serverScore,  setServerScore]  = useState<number | null>(null);
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

  // Load questions for this quiz:
  //  1. /quiz/share/:token  — the questions of a shared exam link
  //  2. /quiz/:articleId    — from ExamPage, StudyPage or an assignment
  // Signed in and online, the canister picks the questions and keeps their
  // answers (graded). Signed out or offline it falls back to practice from
  // the cached question bank, which doesn't count.
  useEffect(() => {
    reset();
    setLoading(true);
    setError(null);
    setGraded(false);
    setPracticeReason(null);
    setServerScore(null);
    setAnswerError(null);
    setAssignmentId(navState?.assignmentId ?? null);

    async function fetchQuestions(ids: string[]): Promise<Question[]> {
      const qs = await Promise.all(ids.map(id => questionService.getQuestion(id)));
      return qs.filter((q): q is Question => q !== null);
    }

    const canGrade = !!principal && examService.gradingAvailable();

    async function load() {
      if (token) {
        const shared = await examService.getByShareToken(token);
        if (!shared) { setError(t("quiz.linkInvalid")); return; }
        const secPerQ = Number(shared.config.secPerQ) || DEFAULT_SECONDS_PER_Q;
        setTimerSeconds(secPerQ);
        if (canGrade) {
          const start = await examService.startGradedSession(
            { ...shared.config, mode: { Solo: null } }, { ShareToken: token },
          );
          loadQuestions(start.questions.map(unrevealed), start.session.id);
          setSessionId(start.session.id);
          setGraded(true);
          return;
        }
        loadQuestions(await fetchQuestions(shared.questionIds), null);
        setPracticeReason("signedOut");
        return;
      }

      const secFromQuery = Number(searchParams.get("sec")) || DEFAULT_SECONDS_PER_Q;
      const countFromQuery = Number(searchParams.get("count")) || 25;
      setTimerSeconds(secFromQuery);
      // An assignment from a coordinator (see AssociationDetailPage) carries
      // its own article set + casebook flag via router state; otherwise this
      // is a single-article self-generated quiz from StudyPage.
      const assignedArticleIds = navState?.articleIds;
      const effectiveArticleIds = assignedArticleIds ?? (articleId ? [articleId] : []);
      const effectiveCasebook = navState?.casebook ?? true;

      if (canGrade) {
        const config: ExamConfig = {
          sportId, articleIds: effectiveArticleIds, casebook: effectiveCasebook,
          count: BigInt(countFromQuery), secPerQ: BigInt(secFromQuery), mode: navState?.mode ?? { Solo: null },
        };
        try {
          const start = await examService.startGradedSession(config, {
            Picks: [{ articleIds: effectiveArticleIds, casebook: effectiveCasebook, count: BigInt(countFromQuery), difficulty: [], adaptive: isAdaptive, tag: navState?.tag ? [navState.tag] : [] }],
          });
          loadQuestions(start.questions.map(unrevealed), start.session.id);
          setSessionId(start.session.id);
          setGraded(true);
          return;
        } catch (e: any) {
          // A refusal from the canister is a real error; a network failure
          // falls through to offline practice.
          if (navigator.onLine && e?.message && !/fetch|network|Failed to/i.test(e.message)) throw e;
        }
      }

      // Practice: both fall back to the IndexedDB content cache when the
      // canister is unreachable, so this can succeed offline too.
      const quizFilter = {
        sportId, articleIds: effectiveArticleIds, casebook: effectiveCasebook,
        difficulty: [] as [], count: BigInt(countFromQuery),
      };
      const qs = isAdaptive && principal
        ? await questionService.getAdaptiveQuiz(quizFilter)
        : await questionService.sampleQuiz(quizFilter);
      if (qs.length === 0) { setError(t("quiz.noCachedQuestions")); return; }
      loadQuestions(qs, null);
      setPracticeReason(principal ? "offline" : "signedOut");
    }

    load()
      .catch((e) => setError(e?.message || t("quiz.loadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, token, sportId]);

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
    if (timeLeft === 0) { submitChoiceRef.current("__timeout__"); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, chosen, isComplete, loading, hasVideo, videoWatched]);

  const submitChoice = useCallback(async (choiceId: string) => {
    if (chosen !== null || !currentQ) return;
    const elapsed = timerSeconds - timeLeft;
    setChosen(choiceId);
    setAnswerError(null);

    let isCorrect: boolean;
    if (graded && sessionId) {
      // The canister grades and records the answer, then reveals it.
      setChecking(true);
      try {
        const fb = await examService.answerQuestion(sessionId, currentQ.id, choiceId, elapsed);
        revealQuestion(currentQ.id, fb.correctId, fb.explanation, fb.citation);
        isCorrect = fb.isCorrect;
      } catch (e: any) {
        setChosen(null);
        setAnswerError(e?.message ?? t("quiz.answerFailed"));
        return;
      } finally {
        setChecking(false);
      }
    } else {
      isCorrect = choiceId === currentQ.correctId;
    }

    recordAnswer({ questionId: currentQ.id, chosenId: choiceId, isCorrect, elapsedSec: BigInt(elapsed) });

    // A graded answer is already recorded by the exam canister, which passes
    // it on to the question and ranking canisters when the session finishes.
    if (principal && !graded) {
      const questionId = currentQ.id;
      questionService.recordAnswer(questionId, isCorrect).catch(() =>
        enqueuePendingAction({ kind: "recordAnswer", questionId, isCorrect }),
      );
      // Feeds the "Speed Demon" and "Casebook King" badges — best effort,
      // not queued offline since it's a minor cosmetic counter.
      rankingService.recordAnswerSignal(isCorrect, elapsed, currentQ.isCasebook).catch(() => {});
    }
  }, [chosen, currentQ, timeLeft, timerSeconds, principal, graded, sessionId]);

  const submitChoiceRef = useRef(submitChoice);
  submitChoiceRef.current = submitChoice;

  const handleChoice = useCallback((choiceId: string) => {
    if (hasVideo && !videoWatched) return;
    submitChoice(choiceId);
  }, [submitChoice, hasVideo, videoWatched]);

  const handleNext = useCallback(async () => {
    advance();
    if (currentIdx + 1 < questions.length) return;
    const finalAnswers = answers;
    if (finalAnswers.length === 0) return;

    if (graded && sessionId) {
      try {
        // The canister computes the score and passes the result on to
        // ranking (ELO, streak, skill counters), question (spaced-repetition
        // history) and user (article progress) itself.
        const done = await examService.finishSession(sessionId);
        setServerScore(done.session.score.length ? Number(done.session.score[0]) : 0);
        if (assignmentId) await recordAssignmentCompletion(assignmentId, sessionId);
      } catch {
        // Leave the local tally on screen; the session can be finished again later.
      }
      return;
    }

    if (profile) {
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
    }
  }, [advance, currentIdx, questions, sessionId, answers, profile, graded, assignmentId]);

  const finalScore = serverScore ?? localScore;

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>
        {t("quiz.loadingQuestions")}
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
        >{t("addFriend.backToHome")}</button>
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
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("quiz.complete")}</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: T.navy, marginBottom: 4 }}>
          {finalScore}%
        </div>
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 4 }}>
          {t("quiz.correctCount", { correct: answers.filter(a => a.isCorrect).length, total: questions.length })}
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
          {t("quiz.avgTime", { seconds: avgElapsed })}
        </div>

        <div style={{ textAlign: "left", marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>
            {t("quiz.perQuestionBreakdown")}
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

        {graded && sessionId && (
          <ShareWithMentorButton
            examId={sessionId}
            sportId={sportId}
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
        >{t("addFriend.backToHome")}</button>
      </div>
    );
  }

  if (!currentQ) return null;

  // Graded questions are revealed once the canister has answered.
  const revealed   = chosen !== null && !checking;
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
    const when = daysAgo === 0 ? t("quiz.whenToday") : daysAgo === 1 ? t("quiz.whenYesterday") : t("quiz.whenDaysAgo", { count: daysAgo });
    return currentHistory.repetitions === 0n
      ? t("quiz.historyWrong", { when })
      : t("quiz.historyStreak", { count: Number(currentHistory.repetitions) });
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
      {practiceReason && (
        <div style={{ background: "#3A2F00", color: "#FFD666", fontSize: 11, fontWeight: 600, padding: "5px 16px", textAlign: "center" }}>
          {practiceReason === "offline" ? t("quiz.offlineBanner") : t("quiz.practiceBanner")}
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
              {t("quiz.casebook")} · {currentPlay.citation}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}>{currentPlay.scenario}</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: T.muted }}>
              <strong style={{ color: T.text }}>{t("quiz.ruling")}</strong> {currentPlay.ruling}
            </div>
            {currentPlayDiagram && <CourtDiagram diagram={currentPlayDiagram} />}
          </div>
        )}

        {videoLocked ? (
          <div style={{ padding: "12px 14px", textAlign: "center", color: T.muted, fontSize: 13 }}>
            {t("quiz.videoLocked")}
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
                if (checking && c.id === chosen) { border = T.navy; }
                return (
                  <button
                    key={c.id}
                    disabled={chosen !== null}
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

        {checking && (
          <div style={{ marginTop: 16, fontSize: 13, color: T.muted, textAlign: "center" }}>{t("quiz.checking")}</div>
        )}
        {answerError && (
          <div style={{ marginTop: 16, fontSize: 13, color: T.wrong, textAlign: "center" }}>{answerError}</div>
        )}
        {revealed && (
          <div style={{
            marginTop: 16, padding: "12px 14px",
            background: "#E6F4EC", border: `1px solid ${T.correct}`,
            borderRadius: 8, fontSize: 13, color: T.correct,
          }}>
            <strong>{t("challenge.correct")}</strong> — {currentQ.citation}: {currentQ.explanation}
          </div>
        )}
        {revealed && <ReportQuestionButton key={currentQ.id} questionId={currentQ.id} />}
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
          {currentIdx + 1 >= total ? t("challenge.finish") : t("challenge.nextQuestion")}
        </button>
      </div>
    </div>
  );
}
