import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Principal } from "@icp-sdk/core/principal";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "../components/LoadError";
import { examService } from "../services/exam";
import { userService } from "../services/user";
import { associationService } from "../services/association";
import { exportOrPrint } from "../lib/exportPdf";
import { toCsv } from "../lib/csv";
import { LicenseRequired } from "../lib/license";
import LicensePrompt from "../components/LicensePrompt";
import {
  buildEntries, formatDuration, hours, monthlyTotals, requirementStatus, seasonWindow, totalIn,
  type EntryKind, type Requirement, type RequirementStatus, type TranscriptEntry,
} from "../lib/transcript";

const DEFAULT_SEASON_START = 8; // August, as the app's "2025-26" seasons
const MAX_LISTED = 100;

type Loaded = {
  name: string;
  entries: TranscriptEntry[];
  requirements: { associationName: string; req: Requirement }[];
};

function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const toReq = (r: { hoursPerSeason: bigint; seasonStartMonth: bigint }): Requirement =>
  ({ hoursPerSeason: Number(r.hoursPerSeason), seasonStartMonth: Number(r.seasonStartMonth) });

/**
 * Training-hours transcript (issue #67). At /transcript an official sees
 * their own; at /association/:id/training/:member the association's
 * coordinator sees a member's, with the association's requirement.
 */
export default function TranscriptPage() {
  const { id: associationId, member } = useParams<{ id?: string; member?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, profile } = useAuthStore();

  const q = useCanisterQuery<Loaded>(async () => {
    if (member && associationId) {
      const p = Principal.fromText(member);
      const [sessions, activity, pub, assoc, req] = await Promise.all([
        examService.getMemberTraining(p),
        userService.getMemberTrainingActivity(p),
        userService.getPublicProfile(p),
        associationService.getAssociation(associationId),
        associationService.getTrainingRequirement(associationId),
      ]);
      return {
        name: pub?.displayName ?? t("assocDetail.unnamedOfficial"),
        entries: buildEntries(sessions, activity),
        requirements: req && assoc ? [{ associationName: assoc.name, req: toReq(req) }] : [],
      };
    }
    const [sessions, activity, assocs] = await Promise.all([
      examService.getMyTraining(),
      userService.getMyTrainingActivity(),
      associationService.getMyAssociations(),
    ]);
    const reqs = await Promise.all(assocs.map(a => associationService.getTrainingRequirement(a.id).catch(() => null)));
    return {
      name: profile?.displayName ?? "",
      entries: buildEntries(sessions, activity),
      requirements: assocs.flatMap((a, i) => { const r = reqs[i]; return r ? [{ associationName: a.name, req: toReq(r) }] : []; }),
    };
  }, [isAuthenticated, associationId, member]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t("transcript.signIn")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          {t("sharedReports.goToSignIn")}
        </button>
      </div>
    );
  }
  if (q.loading) return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  if (q.error instanceof LicenseRequired && associationId) return <div style={{ padding: "80px 16px 24px" }}><LicensePrompt associationId={associationId} /></div>;
  if (q.error || !q.data) return <LoadError onRetry={q.reload} />;

  const { name, entries, requirements } = q.data;
  const now = Date.now();
  const seasonStart = requirements[0]?.req.seasonStartMonth ?? DEFAULT_SEASON_START;
  const season = seasonWindow(now, seasonStart);
  const periods = [
    { label: t("transcript.last7Days"), total: totalIn(entries, now - 7 * 86_400_000, now + 1) },
    { label: t("transcript.thisMonth"), total: monthlyTotals(entries, now, 1)[0] },
    { label: t("transcript.thisSeason"), total: totalIn(entries, season.from, season.to) },
    { label: t("transcript.last12Months"), total: totalIn(entries, now - 365 * 86_400_000, now + 1) },
  ];
  const months = monthlyTotals(entries, now, 12);
  const statuses = requirements.map(r => ({ ...r, status: requirementStatus(entries, r.req, now) }));

  const kindLabel = (k: EntryKind): string => ({
    study: t("transcript.kindStudy"),
    quiz: t("transcript.kindQuiz"),
    certExam: t("transcript.kindCertExam"),
    weeklyQuiz: t("transcript.kindWeeklyQuiz"),
    monthlyQuiz: t("transcript.kindMonthlyQuiz"),
  })[k];
  const fmtDay = (ms: number) => new Date(ms).toLocaleDateString();
  const fmtMonth = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", year: "numeric" });

  function exportCsv() {
    const rows: (string | number)[][] = [
      [t("transcript.csvDate"), t("transcript.csvActivity"), t("transcript.csvMinutes"), t("transcript.csvScore"), t("transcript.csvQuestions")],
      ...entries.map(e => [
        new Date(e.at).toISOString().slice(0, 10), kindLabel(e.kind), Math.floor(e.seconds / 60),
        e.score ?? "", e.questions ?? "",
      ]),
      [],
      [t("transcript.csvPeriod"), t("transcript.csvHours"), t("transcript.csvQuizzes"), t("transcript.csvExams")],
      ...periods.map(p => [p.label, hours(p.total.seconds), p.total.quizzes, p.total.exams]),
    ];
    const safeName = (name || "transcript").replace(/[^a-z0-9]+/gi, "_");
    downloadCsv(`${safeName}_training_transcript.csv`, toCsv(rows));
  }

  const card = { padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 } as const;

  return (
    <div style={{ paddingBottom: 32 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .report-card, .report-card * { visibility: visible; }
          .report-card { position: absolute; top: 0; left: 0; width: 100%; }
        }
      `}</style>

      <div className="no-print" style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{t("transcript.title")}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{name}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={exportCsv} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.15)", color: T.white, borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
            {t("transcript.exportCsv")}
          </button>
          <button onClick={() => exportOrPrint(t("transcript.title"))} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.15)", color: T.white, borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
            {t("transcript.exportPdf")}
          </button>
        </div>
      </div>

      <div className="report-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>
          {t("transcript.printedHeader", { name, date: fmtDay(now) })}
        </div>

        {statuses.map(s => (
          <RequirementCard key={s.associationName} associationName={s.associationName} status={s.status} />
        ))}

        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("transcript.totalsTitle")}</div>
          {periods.map(p => (
            <div key={p.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
              <span>{p.label}</span>
              <span style={{ fontWeight: 700 }}>
                {formatDuration(p.total.seconds)}
                <span style={{ fontWeight: 400, color: T.muted }}> · {t("transcript.quizCount", { count: p.total.quizzes })} · {t("transcript.examCount", { count: p.total.exams })}</span>
              </span>
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("transcript.byMonthTitle")}</div>
          {months.map(m => (
            <div key={m.from} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0" }}>
              <span>{fmtMonth(m.from)}</span>
              <span style={{ fontWeight: 600 }}>{formatDuration(m.seconds)}</span>
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("transcript.activityTitle")}</div>
          {entries.length === 0 ? (
            <div style={{ fontSize: 12, color: T.muted }}>{t("transcript.noActivity")}</div>
          ) : entries.slice(0, MAX_LISTED).map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
              <span>
                <span style={{ color: T.muted }}>{fmtDay(e.at)}</span> · {kindLabel(e.kind)}
                {e.score !== null && <span style={{ color: T.muted }}> · {e.score}%</span>}
              </span>
              <span style={{ fontWeight: 600 }}>{e.seconds > 0 ? formatDuration(e.seconds) : "—"}</span>
            </div>
          ))}
          {entries.length > MAX_LISTED && (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>{t("transcript.moreInCsv", { count: entries.length - MAX_LISTED })}</div>
          )}
        </div>

        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{t("transcript.howMeasured")}</div>
      </div>
    </div>
  );
}

function RequirementCard({ associationName, status }: { associationName: string; status: RequirementStatus }) {
  const { t } = useTranslation();
  const color = status.met ? T.correct : T.wrong;
  return (
    <div style={{ padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{t("transcript.requirementTitle", { name: associationName })}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>
        {formatDuration(status.loggedSec)} / {formatDuration(status.requiredSec)}
      </div>
      <div style={{ height: 6, background: T.border, borderRadius: 3, margin: "8px 0" }}>
        <div style={{ width: `${status.pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 12, color: T.muted }}>
        {status.met ? t("transcript.requirementMet") : t("transcript.requirementNotMet")} · {t("transcript.seasonRange", {
          from: new Date(status.from).toLocaleDateString(), to: new Date(status.to - 1).toLocaleDateString(),
        })}
      </div>
    </div>
  );
}
