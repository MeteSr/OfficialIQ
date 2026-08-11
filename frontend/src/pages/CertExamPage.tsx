import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { questionService, type Question } from "../services/question";
import { examService, DEFAULT_CERT_TEMPLATE, type ExamTemplate, type AnswerRecord } from "../services/exam";
import { rankingService } from "../services/ranking";
import { userService } from "../services/user";
import { useAuthStore } from "../store/authStore";
import ShareWithMentorButton from "../components/ShareWithMentorButton";

const SPORT_ID = "ncaa_basketball";

type Phase = "intro" | "loading" | "exam" | "review" | "results" | "error";

// Largest-remainder apportionment: splits `total` across the given weights
// so every share is a whole number and they sum back to `total` exactly.
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

export default function CertExamPage() {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuthStore();

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
  }, [isAuthenticated]);

  // Warn on tab close/refresh while an exam is actively in progress.
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
        // A single overall clock (not a per-question one) means we can only
        // report the average pace across answered questions, not a true
        // per-question elapsed time.
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
      setError("Couldn't submit your exam — your answers are preserved, try again.");
      setPhase("review");
    }
  }, [questions, chosen, sessionId, template, timeLeft, profile]);

  // Overall countdown.
  useEffect(() => {
    if (phase !== "exam" && phase !== "review") return;
    if (timeLeft <= 0) { handleSubmit(); return; }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
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
      if (qs.length === 0) {
        setError("No questions available yet — connect once to download content.");
        setPhase("error");
        return;
      }

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
      setError("Couldn't build the exam — try again.");
      setPhase("error");
    }
  }

  function toggleFlag(id: string) {
    setFlagged(f => {
      const next = new Set(f);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleExit() {
    if (window.confirm("Exit the exam now? Your progress will be lost.")) {
      navigate("/exam");
    }
  }

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const lowTime = timeLeft <= 300;

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Sign in to take the certification simulation.</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          Go to Sign In
        </button>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div>
        <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🎓 Certification Exam Simulation</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{template.name}</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Questions", value: `${Number(template.questionCount)}` },
              { label: "Time limit", value: `${Math.round(Number(template.timeLimitSec) / 60)} minutes` },
              { label: "Format", value: `${100 - Number(template.casebookRatioPct)}% rules · ${Number(template.casebookRatioPct)}% casebook` },
              { label: "Passing score", value: `${Number(template.passThresholdPct)}%` },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: T.muted }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{row.value}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 20, lineHeight: 1.5 }}>
            Answers are not revealed until you submit the full exam. You can flag questions to
            revisit and review your answers before final submission. Once started, the timer
            runs continuously — leaving this screen forfeits your progress.
          </div>
          <button
            onClick={handleBegin}
            style={{ width: "100%", padding: "14px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
          >
            Begin Exam
          </button>
        </div>
      </div>
    );
  }

  if (phase === "loading") {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>Preparing your exam…</div>;
  }

  if (phase === "error") {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>{error}</div>
        <button onClick={() => navigate("/exam")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          Back to Exam
        </button>
      </div>
    );
  }

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
      <div style={{ padding: "24px 16px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{passed ? "🎉" : "📋"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
            {passed ? "You Passed!" : "Not Quite — Keep Studying"}
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: passed ? T.correct : T.wrong }}>
            {finalSession.score}%
          </div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Passing threshold: {Number(template.passThresholdPct)}%
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Section Breakdown</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
          {sections.map((s) => {
            const weak = s.pct < 70;
            return (
              <div
                key={s.articleId}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px", background: weak ? "#FDECEA" : T.surface,
                  border: `1px solid ${weak ? T.wrong : T.border}`, borderRadius: 8,
                }}
              >
                <span style={{ fontSize: 13 }}>
                  {s.articleId.split(":")[1]?.toUpperCase() ?? s.articleId}
                  {weak && <span style={{ color: T.wrong, fontWeight: 700 }}> · weak area</span>}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: weak ? T.wrong : T.text }}>{s.pct}%</span>
              </div>
            );
          })}
        </div>

        {sessionId && (
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
        )}

        <button
          onClick={() => navigate("/home")}
          style={{ width: "100%", padding: "13px 0", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700, marginTop: 12 }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (phase === "review") {
    const answeredCount = Object.keys(chosen).length;
    return (
      <div>
        <div style={{ background: T.navy, padding: "52px 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", color: T.white }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Review Answers</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: lowTime ? T.red : T.white }}>{mm}:{ss}</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>
            {answeredCount}/{questions.length} answered · {flagged.size} flagged
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 20 }}>
            {questions.map((q, i) => {
              const isAnswered = !!chosen[q.id];
              const isFlagged = flagged.has(q.id);
              return (
                <button
                  key={q.id}
                  onClick={() => { setCurrentIdx(i); setPhase("exam"); }}
                  style={{
                    padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 700,
                    background: isFlagged ? "#FFF4D6" : isAnswered ? T.navy : T.bg,
                    color: isFlagged ? "#8A6D00" : isAnswered ? T.white : T.muted,
                    border: `1px solid ${isFlagged ? "#E8C547" : isAnswered ? T.navy : T.border}`,
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => {
              const unanswered = questions.length - answeredCount;
              if (unanswered > 0 && !window.confirm(`${unanswered} question${unanswered === 1 ? "" : "s"} unanswered. Submit anyway?`)) return;
              handleSubmit();
            }}
            style={{ width: "100%", padding: "14px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700, marginBottom: 10 }}
          >
            Submit Exam
          </button>
          <button
            onClick={() => setPhase("exam")}
            style={{ width: "100%", padding: "12px 0", background: "transparent", color: T.muted, fontSize: 13, fontWeight: 600 }}
          >
            Back to Questions
          </button>
        </div>
      </div>
    );
  }

  // phase === "exam"
  const q = questions[currentIdx];
  if (!q) return null;
  const isFlagged = flagged.has(q.id);

  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, zIndex: 200, display: "flex", flexDirection: "column", maxWidth: 430, margin: "0 auto" }}>
      <div style={{ background: T.navy, padding: "16px 16px 12px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <button onClick={handleExit} style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, background: "transparent" }}>Exit</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: lowTime ? "#FF8A80" : T.white }}>{mm}:{ss}</span>
          <button onClick={() => setPhase("review")} style={{ color: T.white, fontSize: 12, fontWeight: 700, background: "transparent" }}>
            Review ›
          </button>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
          Question {currentIdx + 1} of {questions.length}
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${((currentIdx + 1) / questions.length) * 100}%`, background: T.red }} />
        </div>
      </div>

      <div style={{ padding: "16px 16px 0", flex: 1, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: T.red, fontWeight: 600 }}>
            {q.articleId.split(":")[1]?.toUpperCase() ?? "EXAM"}
          </span>
          <button
            onClick={() => toggleFlag(q.id)}
            style={{
              fontSize: 12, fontWeight: 700, background: "transparent",
              color: isFlagged ? "#B8860B" : T.muted,
            }}
          >
            {isFlagged ? "🚩 Flagged" : "⚑ Flag for review"}
          </button>
        </div>
        <p style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.5, marginBottom: 20 }}>{q.stem}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {q.choices.map((c) => {
            const selected = chosen[q.id] === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setChosen(ch => ({ ...ch, [q.id]: c.id }))}
                style={{
                  padding: "13px 16px",
                  background: selected ? "#EEF3FC" : T.surface,
                  border: `2px solid ${selected ? T.navy : T.border}`,
                  borderRadius: 8, textAlign: "left", fontSize: 14, color: T.text,
                  display: "flex", gap: 10, alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 18, color: T.muted }}>{c.id.toUpperCase()}.</span>
                {c.text}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", gap: 10 }}>
        <button
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
          style={{
            flex: 1, padding: "13px 0", borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: currentIdx === 0 ? T.border : T.surface, border: `1px solid ${T.border}`, color: T.text,
          }}
        >
          ‹ Prev
        </button>
        {currentIdx + 1 >= questions.length ? (
          <button
            onClick={() => setPhase("review")}
            style={{ flex: 2, padding: "13px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 14, fontWeight: 700 }}
          >
            Finish → Review
          </button>
        ) : (
          <button
            onClick={() => setCurrentIdx(i => Math.min(questions.length - 1, i + 1))}
            style={{ flex: 2, padding: "13px 0", background: T.navy, color: T.white, borderRadius: 8, fontSize: 14, fontWeight: 700 }}
          >
            Next ›
          </button>
        )}
      </div>
    </div>
  );
}
