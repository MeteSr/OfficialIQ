import { useState } from "react";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "./LoadError";
import { questionService, type Question, type QuestionReport } from "../services/question";
import { userService } from "../services/user";

const card = { padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 } as const;

function when(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleString();
}

/** Officials' reports of wrong or unclear questions, oldest first. */
export function QuestionReportsPanel() {
  const { t } = useTranslation();
  const q = useCanisterQuery(async () => {
    const reports = (await questionService.listQuestionReports(false)).sort((a, b) => Number(a.createdAt - b.createdAt));
    const ids = [...new Set(reports.map(r => r.questionId))];
    const questions = await Promise.all(ids.map(id => questionService.getQuestion(id)));
    return { reports, questions: new Map(ids.map((id, i) => [id, questions[i]])) };
  }, []);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  if (q.error) return <LoadError onRetry={q.reload} />;
  if (q.loading || !q.data) return <div style={{ textAlign: "center", color: T.muted }}>{t("common.loading")}</div>;
  const open = q.data.reports.filter(r => !done.has(r.id));
  if (open.length === 0) return <div style={{ fontSize: 13, color: T.muted, textAlign: "center" }}>{t("moderation.noReports")}</div>;

  async function resolve(r: QuestionReport) {
    setBusy(r.id);
    try {
      await questionService.resolveQuestionReport(r.id, notes[r.id]?.trim() ?? "");
      setDone(s => new Set(s).add(r.id));
    } catch {
      // stays in the list; the admin can retry
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {open.map((r) => {
        const question: Question | null | undefined = q.data!.questions.get(r.questionId);
        return (
          <div key={r.id} style={card}>
            <div style={{ fontSize: 11, fontFamily: T.fontMono, color: T.faint }}>
              {t(`reportQuestion.reason${r.reason}`)} · {r.questionId} · {when(r.createdAt)}
            </div>
            {question && (
              <div style={{ fontSize: 13, color: T.text, marginTop: 6, lineHeight: 1.4 }}>
                <div style={{ fontWeight: 600 }}>{question.stem}</div>
                <div style={{ color: T.muted, marginTop: 4 }}>
                  {t("moderation.keyedAnswer")}: {question.choices.find(c => c.id === question.correctId)?.text ?? question.correctId} · {question.citation}
                </div>
              </div>
            )}
            {r.note && <div style={{ fontSize: 13, color: T.text, marginTop: 8, fontStyle: "italic" }}>“{r.note}”</div>}
            <input
              value={notes[r.id] ?? ""}
              onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value.slice(0, 500) }))}
              placeholder={t("moderation.resolutionPlaceholder")}
              style={{ width: "100%", marginTop: 10, padding: "9px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.bg, color: T.text, boxSizing: "border-box" }}
            />
            <button
              onClick={() => resolve(r)}
              disabled={busy === r.id}
              style={{ width: "100%", marginTop: 8, minHeight: 44, border: 0, borderRadius: 8, background: fill.accent, color: fill.onAccent, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              {busy === r.id ? "…" : t("moderation.markResolved")}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** The newest crashes and failed loads the app reported (src/lib/errorReporting.ts). */
export function AppErrorsPanel() {
  const { t } = useTranslation();
  const q = useCanisterQuery(() => userService.listClientErrors(100), []);
  const [expanded, setExpanded] = useState<bigint | null>(null);

  if (q.error) return <LoadError onRetry={q.reload} />;
  if (q.loading || !q.data) return <div style={{ textAlign: "center", color: T.muted }}>{t("common.loading")}</div>;
  if (q.data.length === 0) return <div style={{ fontSize: 13, color: T.muted, textAlign: "center" }}>{t("moderation.noErrors")}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {q.data.map((e) => (
        <button
          key={String(e.seq)}
          onClick={() => setExpanded(x => (x === e.seq ? null : e.seq))}
          style={{ ...card, textAlign: "left", cursor: "pointer", width: "100%" }}
        >
          <div style={{ fontSize: 11, fontFamily: T.fontMono, color: T.faint }}>
            {e.kind} · {e.platform} · {e.release} · {e.route} · {when(e.at)}
          </div>
          <div style={{ fontSize: 13, color: T.text, marginTop: 4, wordBreak: "break-word" }}>{e.message}</div>
          {expanded === e.seq && e.stack && (
            <pre style={{ fontSize: 10.5, color: T.muted, marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{e.stack}</pre>
          )}
        </button>
      ))}
    </div>
  );
}
