import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { associationService, type AssociationRec } from "../services/association";
import { questionService } from "../services/question";
import { computeReadiness } from "../lib/readiness";
import { DEFAULT_CERT_TEMPLATE, examService, type ExamSession } from "../services/exam";
import { exportOrPrint } from "../lib/exportPdf";

// Per-exam score, extracted from a finished ExamSession. Deliberately NOT
// ranking.EloSnapshot.accuracy — that field is a cumulative career-running
// average, too blunt a signal for "how is this member trending recently".
function scoredExamsChronological(sessions: ExamSession[]): { finishedAtMs: number; score: number }[] {
  return sessions
    .filter(s => s.score.length > 0 && s.finishedAt.length > 0)
    .map(s => ({ finishedAtMs: Number(s.finishedAt[0]) / 1e6, score: Number(s.score[0]) }))
    .sort((a, b) => a.finishedAtMs - b.finishedAtMs);
}

// Academic-year season bucketing (Aug 1 – Jul 31), matching the
// "2025-26"-style CURRENT_SEASON convention used elsewhere in this app
// (StudyPage, WeeklyQuizPage) for points of emphasis.
function seasonOf(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 7 ? y : y - 1; // Aug = month index 7
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export default function AssociationAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, principal } = useAuthStore();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [assoc, setAssoc] = useState<AssociationRec | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [seasonCompare, setSeasonCompare] = useState<{ season: string; avg: number; count: number }[]>([]);
  const [readinessBreakdown, setReadinessBreakdown] = useState<{ onTrack: number; borderline: number; needsWork: number; notEnough: number; total: number }>({ onTrack: 0, borderline: 0, needsWork: 0, notEnough: 0, total: 0 });
  const [missedQuestions, setMissedQuestions] = useState<{ questionId: string; stem: string; citation: string; wrongCount: number; totalCount: number }[]>([]);

  const isCoordinator = !!assoc && !!principal && assoc.coordinator.toString() === principal;

  useEffect(() => {
    if (!isAuthenticated || !id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    associationService.getAssociation(id).then(async (rec) => {
      if (!rec) { setError(t("assocAnalytics.notFound")); return; }
      setAssoc(rec);
      if (rec.coordinator.toString() !== principal) return; // gate below handles messaging

      const members = await associationService.getAssociationMembers(id);
      const [passTemplates, memberExams] = await Promise.all([
        examService.listExamTemplates(rec.sport),
        Promise.all(members.map(p => examService.getExamsFor(p).catch(() => [] as ExamSession[]))),
      ]);
      const passThreshold = passTemplates.length > 0 ? Number(passTemplates[0].passThresholdPct) : Number(DEFAULT_CERT_TEMPLATE.passThresholdPct);
      const memberScoreHistories = memberExams.map(scoredExamsChronological);

      // Season cohort comparison across every member's exam history
      const bySeason: Record<string, number[]> = {};
      for (const history of memberScoreHistories) {
        for (const { finishedAtMs, score } of history) {
          const season = seasonOf(finishedAtMs);
          (bySeason[season] ??= []).push(score);
        }
      }
      const seasons = Object.keys(bySeason).sort().slice(-2);
      setSeasonCompare(seasons.map(s => ({
        season: s,
        avg: Math.round(bySeason[s].reduce((a, b) => a + b, 0) / bySeason[s].length),
        count: bySeason[s].length,
      })));

      // Per-member readiness, aggregated
      let onTrack = 0, borderline = 0, needsWork = 0, notEnough = 0;
      for (const history of memberScoreHistories) {
        const chrono = history.map(h => h.score);
        const r = computeReadiness(chrono, passThreshold);
        if (r.label === "On Track") onTrack++;
        else if (r.label === "Borderline") borderline++;
        else if (r.label === "Needs Work") needsWork++;
        else notEnough++;
      }
      setReadinessBreakdown({ onTrack, borderline, needsWork, notEnough, total: members.length });

      // Most-missed questions across the whole membership (question bank is
      // global, not per-association, so this reflects everyone who's
      // answered — a reasonable proxy given there's no per-association
      // question scoping in this app).
      const missed = await questionService.getMostMissedQuestions(rec.sport, 8);
      const withDetails = await Promise.all(missed.map(async (m) => {
        const q = await questionService.getQuestion(m.questionId).catch(() => null);
        return { ...m, stem: q?.stem ?? m.questionId, citation: q?.citation ?? "" };
      }));
      setMissedQuestions(withDetails);
    }).catch(() => setError(t("assocAnalytics.loadFailed")))
      .finally(() => setLoading(false));
  }, [isAuthenticated, id, principal, t]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📈</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{t("assocAnalytics.signInRequired")}</div>
      </div>
    );
  }
  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  }
  if (error || !assoc) {
    return <div style={{ padding: 24, textAlign: "center", color: T.wrong, paddingTop: 80 }}>{error ?? t("common.notFound")}</div>;
  }
  if (!isCoordinator) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t("assocAnalytics.coordinatorsOnly")}</div>
        <div style={{ fontSize: 13, color: T.muted }}>{t("assocAnalytics.coordinatorsOnlyDesc")}</div>
      </div>
    );
  }

  const readinessPct = readinessBreakdown.total > 0 ? Math.round((readinessBreakdown.onTrack / readinessBreakdown.total) * 100) : 0;
  const trendDelta = seasonCompare.length === 2 ? seasonCompare[1].avg - seasonCompare[0].avg : null;

  return (
    <div style={{ paddingBottom: 32 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .report-card, .report-card * { visibility: visible; }
          .report-card { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>

      <div className="no-print" style={{ background: T.navy, padding: "52px 20px 20px", color: T.white, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>📈 {t("assocAnalytics.pageTitle", { name: assoc.name })}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{t("assocAnalytics.subtitle")}</div>
        </div>
        <button onClick={() => exportOrPrint(`${assoc.name} Analytics`)} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.15)", color: T.white, borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
          🖨️ {t("assocAnalytics.exportPdf")}
        </button>
      </div>

      <div className="report-card" style={{ padding: 16 }}>
        {/* Certification readiness dashboard */}
        <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("assocAnalytics.readinessTitle")}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: T.navy, marginBottom: 4 }}>{readinessPct}%</div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
            {t("assocAnalytics.readinessDesc", { count: readinessBreakdown.total })}
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
            <span style={{ color: T.correct, fontWeight: 700 }}>{t("assocAnalytics.onTrack", { count: readinessBreakdown.onTrack })}</span>
            <span style={{ color: "#D9A400", fontWeight: 700 }}>{t("assocAnalytics.borderline", { count: readinessBreakdown.borderline })}</span>
            <span style={{ color: T.wrong, fontWeight: 700 }}>{t("assocAnalytics.needsWork", { count: readinessBreakdown.needsWork })}</span>
            <span style={{ color: T.muted, fontWeight: 700 }}>{t("assocAnalytics.notEnoughData", { count: readinessBreakdown.notEnough })}</span>
          </div>
        </div>

        {/* Season cohort comparison */}
        <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("assocAnalytics.seasonCompareTitle")}</div>
          {seasonCompare.length === 0 ? (
            <div style={{ fontSize: 12, color: T.muted }}>{t("assocAnalytics.notEnoughSeasonHistory")}</div>
          ) : (
            <>
              {seasonCompare.map(s => (
                <div key={s.season} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span>{s.season}</span>
                  <span style={{ fontWeight: 700 }}>{t("assocAnalytics.avgWithCount", { avg: s.avg, count: s.count })}</span>
                </div>
              ))}
              {trendDelta !== null && (
                <div style={{ fontSize: 12, marginTop: 6, color: trendDelta >= 0 ? T.correct : T.wrong }}>
                  {trendDelta >= 0 ? "▲" : "▼"} {t("assocAnalytics.vsPriorSeason", { delta: Math.abs(trendDelta) })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Most-missed questions */}
        <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("assocAnalytics.mostMissedTitle")}</div>
          {missedQuestions.length === 0 ? (
            <div style={{ fontSize: 12, color: T.muted }}>{t("assocAnalytics.notEnoughAnswerData")}</div>
          ) : (
            missedQuestions.map(m => (
              <div key={m.questionId} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>{m.citation}</div>
                <div style={{ fontSize: 12 }}>{m.stem}</div>
                <div style={{ fontSize: 11, color: T.wrong, marginTop: 2 }}>
                  {t("assocAnalytics.missedOf", { wrong: m.wrongCount, total: m.totalCount, pct: Math.round((m.wrongCount / m.totalCount) * 100) })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
