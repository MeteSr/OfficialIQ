import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { type Question } from "../services/question";
import { examService, unrevealed, type GradedFinish, type GradedStart } from "../services/exam";

type Props = {
  /** Starts (or resumes) the graded session. Called once on mount. */
  start: () => Promise<GradedStart>;
  secPerQ: number;
  /** Small label above each question, e.g. the game. */
  label: string;
  onBack: () => void;
  /** Called once the session is finished and graded. */
  onFinished: (finish: GradedFinish, questions: Question[]) => void | Promise<void>;
};

/**
 * A timed quiz played in a graded exam session: the exam canister holds the
 * answers and reveals each one after it's answered. Used by the game-day
 * refresher and crew pregame; a reopened session resumes at the first
 * unanswered question.
 */
export default function GradedQuiz({ start, secPerQ, label, onBack, onFinished }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [timeLeft, setTimeLeft] = useState(secPerQ);
  const [finishing, setFinishing] = useState(false);
  const questionsRef = useRef<Question[]>([]);
  questionsRef.current = questions;

  const finish = useCallback(async (id: string) => {
    setFinishing(true);
    try {
      const f = await examService.finishSession(id);
      await onFinished(f, questionsRef.current);
    } catch (e: any) {
      setError(e?.message ?? t("gameDay.submitFailed"));
    } finally {
      setFinishing(false);
    }
  }, [onFinished, t]);

  useEffect(() => {
    let cancelled = false;
    start().then(async (s) => {
      if (cancelled) return;
      if (s.questions.length === 0) { setError(t("gameDay.noQuestions")); return; }
      const qs = s.questions.map(unrevealed);
      setSessionId(s.session.id);
      setQuestions(qs);
      questionsRef.current = qs;
      const answered = new Set(s.session.answers.map(a => a.questionId));
      const firstOpen = s.questions.findIndex(q => !answered.has(q.id));
      if (s.session.finishedAt.length || firstOpen === -1) { await finish(s.session.id); return; }
      setIdx(firstOpen);
    })
      .catch((e: any) => { if (!cancelled) setError(e?.message ?? t("gameDay.loadFailed")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setChosen(null); setTimeLeft(secPerQ); }, [idx, secPerQ]);

  const current = questions[idx];

  const choose = useCallback(async (choiceId: string) => {
    if (chosen !== null || !current || !sessionId) return;
    setChosen(choiceId);
    setChecking(true);
    try {
      const fb = await examService.answerQuestion(sessionId, current.id, choiceId, secPerQ - timeLeft);
      setQuestions(qs => qs.map(q => q.id === fb.questionId ? { ...q, correctId: fb.correctId, explanation: fb.explanation, citation: fb.citation } : q));
    } catch (e: any) {
      setChosen(null);
      setError(e?.message ?? t("gameDay.submitFailed"));
    } finally {
      setChecking(false);
    }
  }, [chosen, current, sessionId, secPerQ, timeLeft, t]);

  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  useEffect(() => {
    if (chosen !== null || loading || finishing || error || questions.length === 0) return;
    if (timeLeft === 0) { chooseRef.current("__timeout__"); return; }
    const h = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(h);
  }, [timeLeft, chosen, loading, finishing, error, questions.length]);

  function next() {
    if (idx + 1 < questions.length) { setIdx(i => i + 1); return; }
    if (sessionId) finish(sessionId);
  }

  if (loading || (finishing && !current)) {
    return <div role="status" style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  }

  if (error) {
    return (
      <div role="alert" style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{error}</div>
        <button onClick={onBack} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          {t("gameDay.back")}
        </button>
      </div>
    );
  }

  if (!current) return null;

  const revealed = chosen !== null && !checking;
  const correct = revealed && chosen === current.correctId;
  const isLast = idx + 1 >= questions.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div style={{ background: T.navy, padding: "52px 16px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} aria-label={t("gameDay.back")} style={{ color: T.white, fontSize: 22, background: "transparent" }}>‹</button>
        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(timeLeft / secPerQ) * 100}%`, background: T.red, transition: "width 1s linear" }} />
        </div>
        <span style={{ color: T.white, fontSize: 12, minWidth: 24, textAlign: "right" }}>{timeLeft}s</span>
        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{idx + 1}/{questions.length}</span>
      </div>

      <div style={{ padding: "16px 16px 0", flex: 1 }}>
        <div style={{ fontSize: 12, color: T.red, fontWeight: 600, marginBottom: 8 }}>
          {label}{current.isCasebook ? ` · ${t("gameDay.play")}` : ""}
        </div>
        <p style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.5, marginBottom: 20 }}>{current.stem}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {current.choices.map(c => {
            let bg = T.surface, border = T.border, color = T.text;
            if (revealed) {
              if (c.id === current.correctId) { bg = "#E6F4EC"; border = T.correct; color = T.correct; }
              else if (c.id === chosen) { bg = "#FDECEA"; border = T.wrong; color = T.wrong; }
            }
            return (
              <button
                key={c.id}
                disabled={chosen !== null}
                onClick={() => choose(c.id)}
                style={{ padding: "13px 16px", background: bg, border: `2px solid ${border}`, borderRadius: 8, textAlign: "left", fontSize: 14, color, display: "flex", gap: 10, alignItems: "center" }}
              >
                <span style={{ fontWeight: 700, minWidth: 18, color: T.muted }}>{c.id.toUpperCase()}.</span>
                {c.text}
              </button>
            );
          })}
        </div>

        {revealed && (
          <div style={{ marginTop: 16, padding: "12px 14px", background: correct ? "#E6F4EC" : "#FDECEA", border: `1px solid ${correct ? T.correct : T.wrong}`, borderRadius: 8, fontSize: 13, color: correct ? T.correct : T.wrong }}>
            <strong>{correct ? t("gameDay.correct") : t("gameDay.incorrect")}</strong> · {current.citation}: {current.explanation}
          </div>
        )}
      </div>

      <div style={{ padding: 16 }}>
        <button
          disabled={!revealed || finishing}
          onClick={next}
          style={{ width: "100%", padding: "14px 0", background: revealed && !finishing ? T.navy : T.border, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
        >
          {finishing ? t("gameDay.finishing") : isLast ? t("gameDay.finish") : t("gameDay.next")}
        </button>
      </div>
    </div>
  );
}
