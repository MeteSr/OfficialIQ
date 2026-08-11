import { T } from "../tokens";
import type { ReportSnapshot } from "../services/report";

function fmtDate(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Shared "photo-ready" report card layout — used by both the owner's
// private preview and the public /report/:id view, so the two always
// look identical. Print-friendly: no interactive chrome lives in here.
export default function ReportCardView({ report }: { report: ReportSnapshot }) {
  return (
    <div
      className="report-card"
      style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14,
        overflow: "hidden", maxWidth: 430, margin: "0 auto",
      }}
    >
      <div style={{ background: T.navy, padding: "28px 24px", color: T.white, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", border: `2px solid ${T.red}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          }}>🛡</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.5 }}>OFFICIALIQ REPORT CARD</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{report.displayName}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
          {report.sport.replace(/_/g, " ").toUpperCase()} · {report.state || "—"}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
          Generated {fmtDate(report.generatedAt)}
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Months Active", value: Number(report.monthsActive) },
            { label: "Exams Completed", value: Number(report.examsCompleted) },
            { label: "Avg Score", value: `${Number(report.avgScore)}%` },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.navy }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", background: T.bg, borderRadius: 8, marginBottom: 20,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Accuracy Trend</span>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: report.accuracyTrend.startsWith("+") ? T.correct : report.accuracyTrend.startsWith("-") ? T.wrong : T.muted,
          }}>
            {report.accuracyTrend}
          </span>
        </div>

        {report.topStrongest.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8 }}>STRONGEST AREAS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {report.topStrongest.map(s => (
                <div key={s.articleId} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", background: "#E6F4EC", borderRadius: 6, fontSize: 12,
                }}>
                  <span>{s.title}</span>
                  <span style={{ fontWeight: 700, color: T.correct }}>{Number(s.masteryScore)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.topWeakest.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8 }}>GROWTH AREAS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {report.topWeakest.map(s => (
                <div key={s.articleId} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", background: "#FDECEA", borderRadius: 6, fontSize: 12,
                }}>
                  <span>{s.title}</span>
                  <span style={{ fontWeight: 700, color: T.wrong }}>{Number(s.masteryScore)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.navy }}>~{Number(report.studyHoursEstimated)} hrs</div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>Estimated Study Time</div>
        </div>
      </div>
    </div>
  );
}
