import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "../components/LoadError";
import UpgradeSheet from "../components/UpgradeSheet";
import { questionService } from "../services/question";
import { DEFAULT_CERT_TEMPLATE, examService, type ExamTemplate } from "../services/exam";
import { contentService } from "../services/content";
import { CertGoalFailed, userService, type CertGoal } from "../services/user";
import { useSport } from "../lib/sport";
import { readiness, sections, studyPlan } from "../lib/certReadiness";

const PLAN_DAYS_SHOWN = 14;

function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Certification readiness (issue #65): an estimate of the official's score
 * on their certification exam today, by rule section, weighted like the
 * exam template, and a day-by-day plan to their exam date that changes as
 * their scores do. Pro once the paywall is on (#71).
 */
export default function ReadinessPage() {
  const { t } = useTranslation();
  const { sportId, levelId } = useSport();
  const [goal, setGoal] = useState<CertGoal | null>(null);
  const [dateInput, setDateInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);

  const q = useCanisterQuery(async () => {
    const [acc, templates, articles, myGoal] = await Promise.all([
      questionService.getMyArticleAccuracy(sportId),
      examService.listExamTemplates(sportId),
      contentService.listArticles(sportId, levelId),
      userService.getMyCertGoal(),
    ]);
    return { acc, templates, titles: new Map(articles.map(a => [a.id, a.title])), myGoal };
  }, [sportId, levelId]);

  useEffect(() => {
    if (!q.data) return;
    setGoal(q.data.myGoal);
    setDateInput(q.data.myGoal ? toDateInput(Number(q.data.myGoal.examDate / 1_000_000n)) : "");
  }, [q.data]);

  if (q.loading) return <div role="status" style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  if (q.error || !q.data) return <LoadError onRetry={q.reload} />;

  const { acc, templates, titles } = q.data;
  if (acc.proOnly) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font, color: T.text }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t("readiness.title")}</div>
        <div style={{ fontSize: 14, color: T.muted, marginBottom: 20 }}>{t("readiness.proOnly")}</div>
        <button onClick={() => setUpsell(true)} style={{ padding: "13px 32px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {t("plan.upgradeTitle")}
        </button>
        <UpgradeSheet open={upsell} reason="feature" onClose={() => setUpsell(false)} />
      </div>
    );
  }

  const goalTemplateId = goal?.templateId[0];
  const template: Pick<ExamTemplate, "name" | "passThresholdPct" | "articleWeights"> & { id?: string } =
    templates.find(tp => tp.id === goalTemplateId) ?? templates[0] ?? DEFAULT_CERT_TEMPLATE;
  const threshold = Number(template.passThresholdPct);
  const secs = sections(template.articleWeights, acc.accuracy);
  const r = readiness(secs, threshold);
  const examMs = goal ? Number(goal.examDate / 1_000_000n) : null;
  const plan = examMs !== null ? studyPlan(secs, threshold, Date.now(), examMs) : [];
  const daysLeft = examMs !== null ? plan.length : 0;
  const title = (id: string) => titles.get(id) ?? id;

  async function save(clear: boolean) {
    setSaving(true);
    setSaveError(null);
    try {
      let next: CertGoal | null = null;
      if (!clear) {
        if (!dateInput) { setSaveError(t("readiness.errInPast")); return; }
        const [y, m, d] = dateInput.split("-").map(Number);
        next = await userService.setCertGoal({ examDateMs: new Date(y, m - 1, d, 9).getTime(), templateId: template.id ?? null });
      } else {
        await userService.setCertGoal(null);
        setDateInput("");
      }
      setGoal(next);
    } catch (e) {
      const reason = e instanceof CertGoalFailed ? Object.keys(e.reason)[0] : "";
      setSaveError(reason === "tooFar" ? t("readiness.errTooFar") : reason === "inPast" ? t("readiness.errInPast") : t("readiness.errSave"));
    } finally {
      setSaving(false);
    }
  }

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "15px 16px" } as const;
  const label = { fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint } as const;

  return (
    <div style={{ padding: "52px 16px 32px", fontFamily: T.font, color: T.text, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, lineHeight: 1.05 }}>{t("readiness.title")}</div>

      <div style={card}>
        <div style={label}>{template.name}</div>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 24, marginTop: 8, color: !r.enoughData ? T.text : r.likelyPass ? T.accent : T.wrong }}>
          {!r.enoughData
            ? t("readiness.notEnough", { coverage: r.coverage })
            : r.likelyPass
              ? t("readiness.likelyPass", { score: r.score })
              : t("readiness.notYet", { score: r.score, threshold })}
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 8, lineHeight: 1.45 }}>{t("readiness.howEstimated", { threshold })}</div>
      </div>

      <div style={card}>
        <div style={{ ...label, marginBottom: 10 }}>{t("readiness.bySection")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {secs.map(s => (
            <Link key={s.articleId} to={`/quiz/${s.articleId}?adaptive=1`} style={{ textDecoration: "none", color: T.text }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>{title(s.articleId)}</span>
                <span style={{ fontWeight: 700 }}>{s.estimate}%</span>
              </div>
              <div
                role="progressbar" aria-label={title(s.articleId)} aria-valuenow={s.estimate} aria-valuemin={0} aria-valuemax={100}
                style={{ position: "relative", height: 6, background: T.border, borderRadius: 3 }}
              >
                <div style={{ width: `${s.estimate}%`, height: "100%", borderRadius: 3, background: s.estimate >= threshold ? fill.accent : fill.attention }} />
                <div style={{ position: "absolute", left: `${threshold}%`, top: -2, bottom: -2, width: 2, background: T.text }} />
              </div>
              <div style={{ fontSize: 11, color: T.faint, marginTop: 3 }}>{t("readiness.answered", { count: s.answered })}</div>
            </Link>
          ))}
        </div>
      </div>

      <div style={card}>
        <label htmlFor="exam-date" style={{ ...label, display: "block", marginBottom: 8 }}>{t("readiness.examDate")}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="exam-date" type="date" value={dateInput} min={toDateInput(Date.now())}
            onChange={e => setDateInput(e.target.value)}
            style={{ flex: 1, minHeight: 44, padding: "0 10px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.bg, color: T.text, fontFamily: T.font }}
          />
          <button onClick={() => save(false)} disabled={saving} style={{ minHeight: 44, padding: "0 16px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
            {t("readiness.save")}
          </button>
          {goal && (
            <button onClick={() => save(true)} disabled={saving} style={{ minHeight: 44, padding: "0 12px", background: "transparent", color: T.muted, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer" }}>
              {t("readiness.clear")}
            </button>
          )}
        </div>
        {saveError && <div role="alert" style={{ color: T.wrong, fontSize: 13, marginTop: 8 }}>{saveError}</div>}
        {!goal && <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>{t("readiness.dateHint")}</div>}
      </div>

      {goal && (
        <div style={card}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 22 }}>
            {daysLeft > 0 ? t("readiness.daysLeft", { count: daysLeft }) : t("readiness.examToday")}
          </div>
          <ol aria-label={t("readiness.planLabel")} style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
            {plan.slice(0, PLAN_DAYS_SHOWN).map(day => (
              <li key={day.date} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13 }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.faint, minWidth: 74 }}>
                  {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </span>
                {day.kind === "practiceExam" ? (
                  <Link to="/exam-sim" style={{ color: T.accent, fontWeight: 700 }}>{t("readiness.practiceExam")}</Link>
                ) : day.articleId ? (
                  <Link to={`/quiz/${day.articleId}?adaptive=1`} style={{ color: T.text }}>{t("readiness.studyDay", { title: title(day.articleId) })}</Link>
                ) : (
                  <span style={{ color: T.muted }}>{t("readiness.restDay")}</span>
                )}
              </li>
            ))}
          </ol>
          {plan.length > PLAN_DAYS_SHOWN && (
            <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>{t("readiness.planMore", { count: plan.length - PLAN_DAYS_SHOWN })}</div>
          )}
        </div>
      )}
    </div>
  );
}
