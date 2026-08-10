import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { questionService, type Question } from "../services/question";
import { challengeService, type Challenge } from "../services/challenge";
import { userService } from "../services/user";
import { useAuthStore } from "../store/authStore";

const SECONDS_PER_Q = 30;

type ResultView = { me: number; opponent: number | null };

export default function ChallengePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { principal } = useAuthStore();

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [opponentName, setOpponentName] = useState("your opponent");

  const [currentIdx, setCurrentIdx] = useState(0);
  const [chosen,     setChosen]     = useState<string | null>(null);
  const [correct,    setCorrect]    = useState(0);
  const [timeLeft,   setTimeLeft]   = useState(SECONDS_PER_Q);

  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState<ResultView | null>(null);

  function resultFrom(ch: Challenge): ResultView {
    const mine  = ch.results.find(r => r.principal.toString() === principal);
    const other = ch.results.find(r => r.principal.toString() !== principal);
    return { me: mine ? Number(mine.score) : 0, opponent: other ? Number(other.score) : null };
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    challengeService.getChallenge(id).then(async (ch) => {
      if (!ch) { setError("This challenge doesn't exist or has expired."); return; }
      if (principal && ch.challenger.toString() !== principal && ch.challenged.toString() !== principal) {
        setError("This isn't your challenge.");
        return;
      }

      const opponentPrincipal = ch.challenger.toString() === principal ? ch.challenged : ch.challenger;
      userService.getProfile(opponentPrincipal)
        .then(p => setOpponentName(p?.displayName ?? "your opponent"))
        .catch(() => {});

      const alreadyDone = ch.results.some(r => r.principal.toString() === principal);
      if (alreadyDone) {
        setResult(resultFrom(ch));
        return;
      }

      const qs = (await Promise.all(ch.questionIds.map(qid => questionService.getQuestion(qid))))
        .filter((q): q is Question => q !== null);
      if (qs.length === 0) { setError("This challenge has no questions to answer."); return; }
      setQuestions(qs);
    })
      .catch(() => setError("Failed to load this challenge."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, principal]);

  // Reset per-question state
  useEffect(() => {
    setChosen(null);
    setTimeLeft(SECONDS_PER_Q);
  }, [currentIdx]);

  // Countdown timer
  useEffect(() => {
    if (chosen !== null || loading || result || questions.length === 0) return;
    if (timeLeft === 0) { setChosen("__timeout__"); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, chosen, loading, result, questions.length]);

  const currentQ = questions[currentIdx];

  const handleChoice = useCallback((choiceId: string) => {
    if (chosen !== null || !currentQ) return;
    setChosen(choiceId);
    if (choiceId === currentQ.correctId) setCorrect(c => c + 1);
  }, [chosen, currentQ]);

  const handleNext = useCallback(async () => {
    const isLast = currentIdx + 1 >= questions.length;
    if (!isLast) { setCurrentIdx(i => i + 1); return; }
    if (!id) return;

    const score = Math.round((correct / questions.length) * 100);
    setSubmitting(true);
    try {
      const updated = await challengeService.submitResult(id, score);
      setResult(resultFrom(updated));
    } catch (e: any) {
      setError(e.message ?? "Failed to submit your result.");
    } finally {
      setSubmitting(false);
    }
  }, [currentIdx, questions.length, id, correct]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>
        Loading challenge…
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
          style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
        >Back to Home</button>
      </div>
    );
  }

  if (result) {
    const opponentDone = result.opponent !== null;
    const iWon = opponentDone && result.me > (result.opponent as number);
    const tied = opponentDone && result.me === result.opponent;
    return (
      <div style={{ padding: "24px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>{opponentDone ? (iWon ? "🏆" : tied ? "🤝" : "😤") : "⏳"}</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>
          {opponentDone
            ? tied ? "It's a tie!" : iWon ? "You won!" : `${opponentName} won this one`
            : "Waiting for your opponent…"}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <div style={{
            flex: 1, padding: "16px 0", background: T.surface,
            border: `2px solid ${opponentDone && iWon ? T.correct : T.border}`, borderRadius: 10,
          }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>You</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: T.navy }}>{result.me}%</div>
          </div>
          <div style={{
            flex: 1, padding: "16px 0", background: T.surface,
            border: `2px solid ${opponentDone && !iWon && !tied ? T.correct : T.border}`, borderRadius: 10,
          }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{opponentName}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: T.navy }}>
              {opponentDone ? `${result.opponent}%` : "—"}
            </div>
          </div>
        </div>

        {!opponentDone && (
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
            You'll see the final result once {opponentName} finishes their attempt.
          </div>
        )}

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
        <div style={{ fontSize: 12, color: T.red, fontWeight: 600, marginBottom: 8 }}>
          vs. {opponentName}
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
          disabled={!revealed || submitting}
          onClick={handleNext}
          style={{
            width: "100%", padding: "14px 0",
            background: revealed && !submitting ? T.navy : T.border,
            color: T.white, borderRadius: 8,
            fontSize: 15, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {submitting ? "Submitting…" : currentIdx + 1 >= questions.length ? "Finish →" : "Next Question →"}
        </button>
      </div>
    </div>
  );
}
