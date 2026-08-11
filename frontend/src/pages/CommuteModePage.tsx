import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { questionService, type Question } from "../services/question";
import { rankingService } from "../services/ranking";
import { userService } from "../services/user";
import { useAuthStore } from "../store/authStore";
import { speak, cancelSpeech, isSpeechRecognitionSupported, isSpeechSynthesisSupported, listenForLetter } from "../lib/speech";
import { useSport } from "../lib/sport";

const QUESTION_COUNT = 25;
const LISTEN_TIMEOUT_MS = 12000;
const AUTO_ADVANCE_MS = 3000;

type Phase = "intro" | "loading" | "speaking" | "listening" | "confirming" | "results" | "error";
type AnsweredRecord = { questionId: string; articleId: string; chosenId: string | null; isCorrect: boolean };

export default function CommuteModePage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { sportId: SPORT_ID } = useSport();

  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [lastResult, setLastResult] = useState<{ isCorrect: boolean; letter: string | null } | null>(null);

  const cancelledRef = useRef(false);
  const answersRef = useRef<AnsweredRecord[]>([]);
  const tapResolverRef = useRef<((letter: string | null) => void) | null>(null);
  const [, forceRender] = useState(0);

  const micSupported = isSpeechRecognitionSupported();
  const ttsSupported = isSpeechSynthesisSupported();

  useEffect(() => () => { cancelledRef.current = true; cancelSpeech(); }, []);

  function waitForAnswer(): Promise<string | null> {
    return new Promise((resolve) => {
      tapResolverRef.current = resolve;
      if (micSupported) {
        listenForLetter(LISTEN_TIMEOUT_MS).then(resolve);
      } else {
        setTimeout(() => resolve(null), LISTEN_TIMEOUT_MS);
      }
    });
  }

  const finish = useCallback(async () => {
    setPhase("results");
    const answers = answersRef.current;
    const correct = answers.filter(a => a.isCorrect).length;
    const score = answers.length ? Math.round((correct / answers.length) * 100) : 0;
    await speak(`Session complete. You scored ${correct} out of ${answers.length}.`);

    if (profile) {
      rankingService.recordExamResult(score, answers.length, profile.displayName, profile.sport, profile.state || "TX", 0).catch(() => {});
      rankingService.recordQuestionsAnswered(answers.length).catch(() => {});
      const byArticle = new Map<string, { correct: number; total: number }>();
      answers.forEach((a) => {
        const bucket = byArticle.get(a.articleId) ?? { correct: 0, total: 0 };
        bucket.total += 1;
        if (a.isCorrect) bucket.correct += 1;
        byArticle.set(a.articleId, bucket);
      });
      await Promise.all([...byArticle.entries()].map(([articleId, b]) =>
        userService.recordArticleStudied(articleId, Math.round((b.correct / b.total) * 100)).catch(() => {})
      ));
    }
  }, [profile]);

  const runQuestion = useCallback(async (idx: number, qs: Question[]) => {
    if (cancelledRef.current) return;
    if (idx >= qs.length) { finish(); return; }
    const q = qs[idx];
    setCurrentIdx(idx);
    setLastResult(null);

    setPhase("speaking");
    await speak(`Question ${idx + 1}. ${q.stem}`);
    if (cancelledRef.current) return;
    for (const c of q.choices) {
      if (cancelledRef.current) return;
      await speak(`${c.id.toUpperCase()}. ${c.text}.`);
    }
    if (cancelledRef.current) return;

    setPhase("listening");
    const letter = await waitForAnswer();
    tapResolverRef.current = null;
    if (cancelledRef.current) return;

    const chosen = q.choices.find(c => c.id.toLowerCase() === (letter ?? "").toLowerCase()) ?? null;
    const isCorrect = chosen?.id === q.correctId;
    answersRef.current = [...answersRef.current, { questionId: q.id, articleId: q.articleId, chosenId: chosen?.id ?? null, isCorrect }];
    forceRender(n => n + 1);

    setLastResult({ isCorrect, letter: chosen?.id ?? null });
    setPhase("confirming");
    if (chosen) {
      await speak(isCorrect ? "Correct." : `Incorrect. ${q.citation} — ${q.explanation}`);
    } else {
      await speak("No answer detected. Moving on.");
    }
    if (cancelledRef.current) return;

    await new Promise(r => setTimeout(r, AUTO_ADVANCE_MS));
    if (cancelledRef.current) return;
    runQuestion(idx + 1, qs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish]);

  async function handleBegin() {
    setPhase("loading");
    setError(null);
    cancelledRef.current = false;
    answersRef.current = [];
    try {
      const qs = await questionService.sampleQuiz({
        sportId: SPORT_ID, articleIds: [], casebook: true, difficulty: [], count: BigInt(QUESTION_COUNT),
      });
      if (qs.length === 0) {
        setError("No cached questions available — connect once to download content before going offline.");
        setPhase("error");
        return;
      }
      setQuestions(qs);
      await speak("Commute Mode starting. Listen to each question, then say or tap the letter of your answer.");
      runQuestion(0, qs);
    } catch {
      setError("Couldn't start Commute Mode — try again.");
      setPhase("error");
    }
  }

  function handleStop() {
    cancelledRef.current = true;
    cancelSpeech();
    tapResolverRef.current?.(null);
    navigate("/home");
  }

  function handleTap(letter: string) {
    tapResolverRef.current?.(letter);
  }

  if (phase === "intro") {
    return (
      <div style={{ position: "fixed", inset: 0, background: T.navy, color: T.white, display: "flex", flexDirection: "column", maxWidth: 430, margin: "0 auto" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎧</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Commute Mode</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 24, lineHeight: 1.5 }}>
            {QUESTION_COUNT} questions read aloud, hands-free. {micSupported
              ? "Say “A”, “B”, “C”, or “D” to answer, or tap the screen."
              : "Voice recognition isn't supported in this browser — tap the screen to answer."}
          </div>
          {!ttsSupported && (
            <div style={{ fontSize: 12, color: "#FFD666", marginBottom: 16 }}>
              ⚠️ Text-to-speech isn't supported in this browser — Commute Mode will run silently with on-screen text only.
            </div>
          )}
          <button
            onClick={handleBegin}
            style={{ padding: "15px 40px", background: T.red, color: T.white, borderRadius: 10, fontSize: 16, fontWeight: 700 }}
          >
            ▶ Start Commute Mode
          </button>
          <button onClick={() => navigate("/home")} style={{ marginTop: 16, color: "rgba(255,255,255,0.6)", fontSize: 13, background: "transparent" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div style={{ position: "fixed", inset: 0, background: T.navy, color: T.white, display: "flex", alignItems: "center", justifyContent: "center", maxWidth: 430, margin: "0 auto" }}>
        Preparing your session…
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>{error}</div>
        <button onClick={() => navigate("/home")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          Back to Home
        </button>
      </div>
    );
  }

  if (phase === "results") {
    const answers = answersRef.current;
    const correct = answers.filter(a => a.isCorrect).length;
    return (
      <div style={{ padding: "24px 16px", textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Commute Session Complete</div>
        <div style={{ fontSize: 36, fontWeight: 700, color: T.navy, marginBottom: 20 }}>
          {correct} / {answers.length}
        </div>
        <button
          onClick={() => navigate("/home")}
          style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  // phase === "speaking" | "listening" | "confirming"
  const q = questions[currentIdx];
  if (!q) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: T.navy, color: T.white, display: "flex", flexDirection: "column", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ padding: "52px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Question {currentIdx + 1} of {questions.length}</span>
        <button onClick={handleStop} style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, background: "transparent" }}>
          ■ Stop
        </button>
      </div>

      <div style={{ padding: "0 20px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{
          fontSize: 13, fontWeight: 700, marginBottom: 12, textAlign: "center",
          color: phase === "speaking" ? "#A8C4F5" : phase === "listening" ? T.red : lastResult?.isCorrect ? "#7FE3A6" : "#FF8A80",
        }}>
          {phase === "speaking" && "🔊 Reading question…"}
          {phase === "listening" && (micSupported ? "🎙️ Listening — say A, B, C, or D" : "👆 Tap your answer")}
          {phase === "confirming" && (lastResult?.isCorrect ? "✓ Correct" : "✗ " + (lastResult?.letter ? "Incorrect" : "No answer"))}
        </div>

        <p style={{ fontSize: 18, fontWeight: 500, lineHeight: 1.5, textAlign: "center", marginBottom: 24 }}>{q.stem}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.choices.map((c) => {
            const isChosen = lastResult && lastResult.letter === c.id;
            const isCorrectChoice = phase === "confirming" && c.id === q.correctId;
            return (
              <button
                key={c.id}
                disabled={phase !== "listening"}
                onClick={() => handleTap(c.id)}
                style={{
                  padding: "14px 16px", borderRadius: 8, textAlign: "left", fontSize: 14,
                  display: "flex", gap: 10, alignItems: "center",
                  background: isCorrectChoice ? "rgba(127,227,166,0.2)" : isChosen ? "rgba(200,16,46,0.25)" : "rgba(255,255,255,0.08)",
                  border: `2px solid ${isCorrectChoice ? "#7FE3A6" : isChosen ? T.red : "rgba(255,255,255,0.2)"}`,
                  color: T.white,
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 18 }}>{c.id.toUpperCase()}.</span>
                {c.text}
              </button>
            );
          })}
        </div>

        {phase === "confirming" && !lastResult?.isCorrect && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 16, textAlign: "center" }}>
            {q.citation}: {q.explanation}
          </div>
        )}
      </div>

      <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
        Auto-advances in {phase === "confirming" ? "a few seconds" : "…"}
      </div>
    </div>
  );
}
