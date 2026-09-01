import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { questionService, type Question } from "../services/question";
import { examService, DEFAULT_CERT_TEMPLATE, type ExamTemplate, type AnswerRecord } from "../services/exam";
import { rankingService } from "../services/ranking";
import { userService } from "../services/user";
import { useAuthStore } from "../store/authStore";
import ShareWithMentorButton from "../components/ShareWithMentorButton";
import { useSport } from "../lib/sport";

type Phase = "intro" | "loading" | "exam" | "review" | "results" | "error";

function distributeByWeight(total: number, weights: [string, bigint][]): Record<string, number> {
  const totalWeight = weights.reduce((s, [, w]) => s + Number(w), 0) || 1;
  const shares = weights.map(([id, w]) => {
    const exact = (total * Number(w)) / totalWeight;
    return { id, count: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let remaining = total - shares.reduce((s, x) => s + x.count, 0);
  const byRemainder = [...shares].sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < remaining; i++) byRemainder[i % byRemainder.length].count += 1;
  return Object.fromEntries(shares.map(s => [s.id, s.count]));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function masteryColor(pct: number) {
  return pct >= 80 ? fill.accent : pct >= 70 ? fill.attention : fill.wrong;
}

export default function CertExamPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, profile } = useAuthStore();
  const { sportId: SPORT_ID } = useSport();

  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<ExamTemplate | (typeof DEFAULT_CERT_TEMPLATE & { id: string; createdAt: bigint })>({
    ...DEFAULT_CERT_TEMPLATE, id: "default", createdAt: 0n,
  });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const [finalSession, setFinalSession] = useState<{ score: number; avgElapsedSec: number; answers: AnswerRecord[] } | null>(null);

  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    examService.listExamTemplates(SPORT_ID).then((templates) => {
      if (templates.length > 0) setTemplate(templates[0]);
    }).catch(() => {});
  }, [isAuthenticated, SPORT_ID]);

  useEffect(() => {
    if (phase !== "exam" && phase !== "review") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  const handleSubmit = useCallback(async () => {
    setPhase("loading");
    const answers: AnswerRecord[] = questions
      .filter(q => chosen[q.id])
      .map(q => ({
        questionId: q.id,
        chosenId: chosen[q.id],
        isCorrect: chosen[q.id] === q.correctId,
        elapsedSec: BigInt(Math.max(0, Math.round(
          (Number(template.timeLimitSec) - timeLeft) / Math.max(1, Object.keys(chosen).length),
        ))),
      }));

    const avgElapsedSec = answers.length
      ? Number(answers.reduce((s, a) => s + a.elapsedSec, 0n)) / answers.length
      : 0;

    try {
      if (sessionId) {
        const updated = await examService.submitExam(sessionId, answers);
        setFinalSession({ score: updated.score.length ? Number(updated.score[0]) : 0, avgElapsedSec, answers });
      } else {
        const correct = answers.filter(a => a.isCorrect).length;
        setFinalSession({ score: answers.length ? Math.round((correct / answers.length) * 100) : 0, avgElapsedSec, answers });
      }

      if (profile) {
        const correct = answers.filter(a => a.isCorrect).length;
        const overallScore = answers.length ? Math.round((correct / answers.length) * 100) : 0;
        rankingService.recordExamResult(
          overallScore, questions.length, profile.displayName, profile.sport, profile.state || "TX", avgElapsedSec,
        ).catch(() => {});
        rankingService.recordQuestionsAnswered(answers.length).catch(() => {});

        const byArticle = new Map<string, { correct: number; total: number }>();
        questions.forEach((q) => {
          if (!chosen[q.id]) return;
          const bucket = byArticle.get(q.articleId) ?? { correct: 0, total: 0 };
          bucket.total += 1;
          if (chosen[q.id] === q.correctId) bucket.correct += 1;
          byArticle.set(q.articleId, bucket);
        });
        await Promise.all([...byArticle.entries()].map(([articleId, b]) =>
          userService.recordArticleStudied(articleId, Math.round((b.correct / b.total) * 100)).catch(() => {})
        ));
      }
      setPhase("results");
    } catch {
      setError(t("certExam.submitFailed"));
      setPhase("review");
    }
  }, [questions, chosen, sessionId, template, timeLeft, profile, t]);

  useEffect(() => {
    if (phase !== "exam" && phase !== "review") return;
    if (timeLeft <= 0) { handleSubmit(); return; }
    const timer = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, timeLeft, handleSubmit]);

  async function handleBegin() {
    setPhase("loading");
    setError(null);
    try {
      const total = Number(template.questionCount);
      const casebookTotal = Math.round(total * Number(template.casebookRatioPct) / 100);
      const rulesTotal = total - casebookTotal;
      const rulesByArticle = distributeByWeight(rulesTotal, template.articleWeights);
      const caseByArticle = distributeByWeight(casebookTotal, template.articleWeights);

      const pools = await Promise.all(template.articleWeights.flatMap(([articleId]) => [
        rulesByArticle[articleId] > 0
          ? questionService.sampleQuiz({ sportId: SPORT_ID, articleIds: [articleId], casebook: false, difficulty: [], count: BigInt(rulesByArticle[articleId]) })
          : Promise.resolve([]),
        caseByArticle[articleId] > 0
          ? questionService.sampleQuiz({ sportId: SPORT_ID, articleIds: [articleId], casebook: true, difficulty: [], count: BigInt(caseByArticle[articleId]) })
          : Promise.resolve([]),
      ]));
      const qs = shuffle(pools.flat());
      if (qs.length === 0) { setError(t("certExam.noQuestions")); setPhase("error"); return; }

      const session = await examService.createSession({
        sportId: SPORT_ID, articleIds: template.articleWeights.map(([id]) => id), casebook: true,
        count: BigInt(qs.length), secPerQ: BigInt(Math.round(Number(template.timeLimitSec) / qs.length)),
        mode: { Certification: null },
      }, qs.map(q => q.id)).catch(() => null);

      setQuestions(qs);
      setSessionId(session?.id ?? null);
      setChosen({});
      setFlagged(new Set());
      setCurrentIdx(0);
      setTimeLeft(Number(template.timeLimitSec));
      startedAtRef.current = Date.now();
      setPhase("exam");
    } catch {
      setError(t("certExam.buildFailed"));
      setPhase("error");
    }
  }

  function toggleFlag(id: string) {
    setFlagged(f => { const next = new Set(f); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function handleExit() {
    if (window.confirm(t("certExam.exitConfirm"))) navigate("/exam");
  }

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const lowTime = timeLeft <= 300;

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: T.text }}>{t("certExam.signInRequired")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
          {t("certExam.goToSignIn")}
        </button>
      </div>
    );
  }

  /* ── INTRO ── */
  if (phase === "intro") {
    const rulesRatio = 100 - Number(template.casebookRatioPct);
    const caseRatio  = Number(template.casebookRatioPct);
    return (
      <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font, display: "flex", flexDirection: "column" }}>
        <div style={{ background: T.panelAlt, padding: "56px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text, lineHeight: 1.05 }}>
            {t("certExam.title")}
          </div>
          <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.09em", color: T.faint, marginTop: 7 }}>
            {template.name.toUpperCase()}
          </div>
        </div>
        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: t("certExam.questionsLabel"),    value: `${Number(template.questionCount)}`,                                        accent: false },
            { label: t("certExam.timeLimitLabel"),    value: t("certExam.minutes", { count: Math.round(Number(template.timeLimitSec) / 60) }), accent: false },
            { label: t("certExam.formatLabel"),        value: `${rulesRatio} rules / ${caseRatio} casebook`,                              accent: false },
            { label: t("certExam.passingScoreLabel"), value: `${Number(template.passThresholdPct)}%`,                                    accent: true  },
          ].map(row => (
            <div key={row.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 16px", background: T.surface,
              border: `1px solid ${row.accent ? fill.attention : T.border}`,
              borderLeft: `${row.accent ? `3px solid ${fill.attention}` : `1px solid ${T.border}`}`,
              borderRadius: 8,
            }}>
              <span style={{ fontFamily: T.font, fontSize: 13, color: T.muted }}>{row.label}</span>
              <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 19, color: row.accent ? fill.attention : T.text }}>
                {row.value}
              </span>
            </div>
          ))}
          <p style={{ fontFamily: T.font, fontSize: 12.5, lineHeight: 1.6, color: "rgba(243,244,241,0.5)", margin: "10px 0 0" }}>
            {t("certExam.introDisclaimer")}
          </p>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleBegin}
            style={{ width: "100%", minHeight: 52, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            {t("certExam.beginExam")}
          </button>
        </div>
      </div>
    );
  }

  /* ── LOADING ── */
  if (phase === "loading") {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80, fontFamily: T.font }}>{t("certExam.preparing")}</div>;
  }

  /* ── ERROR ── */
  if (phase === "error") {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font }}>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 22, color: fill.wrong, marginBottom: 12 }}>{error}</div>
        <button onClick={() => navigate("/exam")} style={{ padding: "12px 24px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, cursor: "pointer" }}>
          {t("certExam.backToExam")}
        </button>
      </div>
    );
  }

  /* ── RESULTS ── */
  if (phase === "results" && finalSession) {
    const passed = finalSession.score >= Number(template.passThresholdPct);
    const byArticle = new Map<string, { correct: number; total: number }>();
    questions.forEach((q) => {
      const bucket = byArticle.get(q.articleId) ?? { correct: 0, total: 0 };
      bucket.total += 1;
      if (chosen[q.id] === q.correctId) bucket.correct += 1;
      byArticle.set(q.articleId, bucket);
    });
    const sections = [...byArticle.entries()]
      .map(([articleId, b]) => ({ articleId, pct: Math.round((b.correct / b.total) * 100), total: b.total }))
      .sort((a, b) => a.pct - b.pct);

    return (
      <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font, paddingBottom: 32 }}>
        <div style={{ textAlign: "center", padding: "40px 16px 24px" }}>
          <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 19, color: T.text, lineHeight: 1.2 }}>
            {passed ? t("certExam.passedTitle") : t("certExam.failedTitle")}
          </div>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 56, color: passed ? fill.accent : fill.wrong, marginTop: 6 }}>
            {finalSession.score}%
          </div>
          <div style={{ fontFamily: T.font, fontSize: 12.5, color: "rgba(243,244,241,0.5)", marginTop: 6 }}>
            {t("certExam.passingThreshold", { pct: Number(template.passThresholdPct) })}
          </div>
        </div>

        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint, marginBottom: 10 }}>
            {t("certExam.sectionBreakdown")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {sections.map((s) => {
              const color = masteryColor(s.pct);
              const weak = s.pct < 70;
              return (
                <div
                  key={s.articleId}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    padding: "12px 14px", background: T.surface,
                    border: `1px solid ${T.border}`, borderLeft: `3px solid ${color}`, borderRadius: 8,
                  }}
                >
                  <span style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13, color: T.text }}>
                    {s.articleId.split(":")[1]?.toUpperCase() ?? s.articleId}
                    {weak && (
                      <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.08em", color: fill.wrong }}> · WEAK AREA</span>
                    )}
                  </span>
                  <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 18, color }}>{s.pct}%</span>
                </div>
              );
            })}
          </div>

          {sessionId && (
            <div style={{ marginTop: 16 }}>
              <ShareWithMentorButton
                examId={sessionId}
                sportId={SPORT_ID}
                score={finalSession.score}
                avgElapsedSec={finalSession.avgElapsedSec}
                answers={finalSession.answers.map(a => ({
                  questionId: a.questionId, chosenId: a.chosenId,
                  correctId: questions.find(q => q.id === a.questionId)?.correctId ?? "",
                  isCorrect: a.isCorrect, elapsedSec: a.elapsedSec,
                }))}
              />
            </div>
          )}

          <button
            onClick={() => navigate("/home")}
            style={{ width: "100%", minHeight: 48, marginTop: 12, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {t("addFriend.backToHome")}
          </button>
        </div>
      </div>
    );
  }

  /* ── REVIEW ── */
  if (phase === "review") {
    const answeredCount = Object.keys(chosen).length;
    const unansweredCount = questions.length - answeredCount;
    return (
      <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font, display: "flex", flexDirection: "column" }}>
        <div style={{ background: T.panelAlt, padding: "52px 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.font, fontWeight: 600, fontSize: 16, color: T.text }}>{t("certExam.reviewAnswers")}</span>
          <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 20, color: lowTime ? fill.attention : fill.attention }}>{mm}:{ss}</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 11, letterSpacing: "0.07em", color: T.faint }}>
            {answeredCount} ANSWERED · {unansweredCount} UNANSWERED · {flagged.size} FLAGGED
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7, marginTop: 14 }}>
            {questions.map((q, i) => {
              const isAnswered = !!chosen[q.id];
              const isFlagged = flagged.has(q.id);
              return (
                <button
                  key={q.id}
                  onClick={() => { setCurrentIdx(i); setPhase("exam"); }}
                  style={{
                    minHeight: 38, borderRadius: 6,
                    background: isFlagged ? "rgba(230,180,60,0.16)" : isAnswered ? T.surface : T.bg,
                    border: `1px solid ${isFlagged ? fill.attention : isAnswered ? "rgba(120,200,150,.45)" : T.border}`,
                    color: isFlagged ? fill.attention : isAnswered ? T.text : T.faint,
                    fontFamily: T.fontMono, fontWeight: 600, fontSize: 12, cursor: "pointer",
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 9.5, color: "rgba(243,244,241,0.32)", marginTop: 12, lineHeight: 1.6 }}>
            FILLED ANSWERED · AMBER FLAGGED · OUTLINE UNTOUCHED
          </div>
          <button
            onClick={() => {
              if (unansweredCount > 0 && !window.confirm(t("certExam.submitConfirm", { count: unansweredCount }))) return;
              handleSubmit();
            }}
            style={{ width: "100%", minHeight: 50, marginTop: 18, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            {t("certExam.submitExam")}
          </button>
          <button
            onClick={() => setPhase("exam")}
            style={{ width: "100%", padding: "12px 0", marginTop: 8, background: "transparent", border: 0, color: T.muted, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            {t("certExam.backToQuestions")}
          </button>
        </div>
      </div>
    );
  }

  /* ── EXAM ── */
  const q = questions[currentIdx];
  if (!q) return null;
  const isFlagged = flagged.has(q.id);

  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, zIndex: 200, display: "flex", flexDirection: "column", maxWidth: 430, margin: "0 auto", fontFamily: T.font }}>
      {/* Top bar */}
      <div style={{ background: T.panelAlt, padding: "52px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <button onClick={handleExit} style={{ minHeight: 44, background: "transparent", border: 0, color: T.muted, fontFamily: T.font, fontWeight: 500, fontSize: 12, padding: 0, cursor: "pointer" }}>
            {t("certExam.exit")}
          </button>
          <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 22, color: lowTime ? fill.attention : fill.attention, letterSpacing: "0.02em" }}>
            {mm}:{ss}
          </span>
          <button onClick={() => setPhase("review")} style={{ minHeight: 44, background: "transparent", border: 0, color: T.text, fontFamily: T.font, fontWeight: 600, fontSize: 12, padding: 0, cursor: "pointer" }}>
            {t("certExam.review")}
          </button>
        </div>
        <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.09em", color: T.faint, margin: "8px 0 7px" }}>
          QUESTION {currentIdx + 1} OF {questions.length}
        </div>
        <div style={{ height: 3, borderRadius: 2, background: T.border, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${((currentIdx + 1) / questions.length) * 100}%`, background: fill.accent }} />
        </div>
      </div>

      {/* Question body */}
      <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: fill.accent }}>
            {q.articleId.split(":")[1]?.toUpperCase() ?? "EXAM"}
          </span>
          <button
            onClick={() => toggleFlag(q.id)}
            style={{ minHeight: 40, background: "transparent", border: 0, padding: 0, fontFamily: T.fontMono, fontWeight: 600, fontSize: 11.5, letterSpacing: "0.06em", color: isFlagged ? fill.attention : T.faint, cursor: "pointer" }}
          >
            {isFlagged ? t("certExam.flagged") : t("certExam.flagForReview")}
          </button>
        </div>
        <p style={{ fontFamily: T.font, fontWeight: 400, fontSize: 16, lineHeight: 1.55, color: T.text, margin: "14px 0 0" }}>
          {q.stem}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
          {q.choices.map((c) => {
            const sel = chosen[q.id] === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setChosen(ch => ({ ...ch, [q.id]: c.id }))}
                style={{
                  minHeight: 54, padding: "14px 16px",
                  background: sel ? "rgba(120,200,150,0.13)" : T.surface,
                  border: `1px solid ${sel ? fill.accent : T.border}`,
                  borderRadius: 8, textAlign: "left", display: "flex", gap: 11, alignItems: "center",
                  fontFamily: T.font, fontSize: 14.5, lineHeight: 1.35, color: T.text, cursor: "pointer",
                }}
              >
                <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 12, minWidth: 16, color: sel ? fill.accent : T.faint }}>
                  {c.id.toUpperCase()}
                </span>
                <span style={{ flex: 1 }}>{c.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ padding: 16, display: "flex", gap: 10 }}>
        <button
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
          style={{
            flex: 1, minHeight: 50, borderRadius: 8,
            background: T.surface, border: `1px solid ${T.border}`,
            color: currentIdx === 0 ? T.faint : T.text,
            fontFamily: T.font, fontWeight: 600, fontSize: 14, cursor: currentIdx === 0 ? "default" : "pointer",
          }}
        >
          {t("certExam.prev")}
        </button>
        {currentIdx + 1 >= questions.length ? (
          <button
            onClick={() => setPhase("review")}
            style={{ flex: 2, minHeight: 50, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            {t("certExam.finishReview")}
          </button>
        ) : (
          <button
            onClick={() => setCurrentIdx(i => Math.min(questions.length - 1, i + 1))}
            style={{ flex: 2, minHeight: 50, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
          >
            {t("certExam.next")}
          </button>
        )}
      </div>
    </div>
  );
}
