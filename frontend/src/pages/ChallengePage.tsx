import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { type Question } from "../services/question";
import { examService, unrevealed } from "../services/exam";
import { challengeService, type Challenge } from "../services/challenge";
import { userService } from "../services/user";
import { useAuthStore } from "../store/authStore";

const SECONDS_PER_Q = 30;

type ResultView = { me: number; opponent: number | null };

export default function ChallengePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { principal } = useAuthStore();

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [opponentName, setOpponentName] = useState(t("challenge.yourOpponent"));

  const [currentIdx, setCurrentIdx] = useState(0);
  const [chosen,     setChosen]     = useState<string | null>(null);
  const [timeLeft,   setTimeLeft]   = useState(SECONDS_PER_Q);

  const [submitting, setSubmitting] = useState(false);
  // Challenges are played in a graded exam session: the canister holds the
  // answers and reveals each one after it's answered.
  const [sessionId,  setSessionId]  = useState<string | null>(null);
  const [checking,   setChecking]   = useState(false);
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
      if (!ch) { setError(t("challenge.notFound")); return; }
      if (principal && ch.challenger.toString() !== principal && ch.challenged.toString() !== principal) {
        setError(t("challenge.notYours"));
        return;
      }

      const opponentPrincipal = ch.challenger.toString() === principal ? ch.challenged : ch.challenger;
      userService.getPublicProfile(opponentPrincipal)
        .then(p => setOpponentName(p?.displayName ?? t("challenge.yourOpponent")))
        .catch(() => {});

      const alreadyDone = ch.results.some(r => r.principal.toString() === principal);
      if (alreadyDone) {
        setResult(resultFrom(ch));
        return;
      }

      if (!principal) { setError(t("challenge.notYours")); return; }
      const start = await examService.startGradedSession({
        sportId: ch.sport, articleIds: ch.articleIds, casebook: false,
        count: BigInt(ch.questionIds.length), secPerQ: BigInt(SECONDS_PER_Q), mode: { Timed: null },
      }, { Ids: ch.questionIds });
      if (start.questions.length === 0) { setError(t("challenge.noQuestions")); return; }
      setSessionId(start.session.id);
      setQuestions(start.questions.map(unrevealed));
      // One session per player per challenge: reopening resumes it.
      const answeredIds = new Set(start.session.answers.map(a => a.questionId));
      const firstOpen = start.questions.findIndex(q => !answeredIds.has(q.id));
      if (start.session.finishedAt.length || firstOpen === -1) {
        await examService.finishSession(start.session.id);
        setResult(resultFrom(await challengeService.submitGradedResult(ch.id, start.session.id)));
        return;
      }
      setCurrentIdx(firstOpen);
    })
      .catch(() => setError(t("challenge.loadFailed")))
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
    if (timeLeft === 0) { handleChoiceRef.current("__timeout__"); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, chosen, loading, result, questions.length]);

  const currentQ = questions[currentIdx];

  const handleChoice = useCallback(async (choiceId: string) => {
    if (chosen !== null || !currentQ || !sessionId) return;
    setChosen(choiceId);
    setChecking(true);
    try {
      const fb = await examService.answerQuestion(sessionId, currentQ.id, choiceId, SECONDS_PER_Q - timeLeft);
      setQuestions(qs => qs.map(q => q.id === fb.questionId ? { ...q, correctId: fb.correctId, explanation: fb.explanation, citation: fb.citation } : q));
    } catch (e: any) {
      setChosen(null);
      setError(e?.message ?? t("challenge.submitFailed"));
    } finally {
      setChecking(false);
    }
  }, [chosen, currentQ, sessionId, timeLeft]);

  const handleChoiceRef = useRef(handleChoice);
  handleChoiceRef.current = handleChoice;

  const handleNext = useCallback(async () => {
    const isLast = currentIdx + 1 >= questions.length;
    if (!isLast) { setCurrentIdx(i => i + 1); return; }
    if (!id) return;

    if (!sessionId) return;
    setSubmitting(true);
    try {
      // The score comes from the exam canister's grading of this session.
      await examService.finishSession(sessionId);
      const updated = await challengeService.submitGradedResult(id, sessionId);
      setResult(resultFrom(updated));
    } catch (e: any) {
      setError(e.message ?? t("challenge.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }, [currentIdx, questions.length, id, sessionId]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>
        {t("challenge.loadingChallenge")}
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
        >{t("addFriend.backToHome")}</button>
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
            ? tied ? t("challenge.tied") : iWon ? t("challenge.youWon") : t("challenge.opponentWon", { name: opponentName })
            : t("challenge.waitingForOpponent")}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <div style={{
            flex: 1, padding: "16px 0", background: T.surface,
            border: `2px solid ${opponentDone && iWon ? T.correct : T.border}`, borderRadius: 10,
          }}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{t("challenge.you")}</div>
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
            {t("challenge.waitingDesc", { name: opponentName })}
          </div>
        )}

        <button
          onClick={() => navigate("/home")}
          style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
        >{t("addFriend.backToHome")}</button>
      </div>
    );
  }

  if (!currentQ) return null;

  const revealed = chosen !== null && !checking;
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
          {t("challenge.vs", { name: opponentName })}
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

        {revealed && (
          <div style={{
            marginTop: 16, padding: "12px 14px",
            background: "#E6F4EC", border: `1px solid ${T.correct}`,
            borderRadius: 8, fontSize: 13, color: T.correct,
          }}>
            <strong>{t("challenge.correct")}</strong> — {currentQ.citation}: {currentQ.explanation}
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
          {submitting ? t("challenge.submitting") : currentIdx + 1 >= questions.length ? t("challenge.finish") : t("challenge.nextQuestion")}
        </button>
      </div>
    </div>
  );
}
