import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { reportService, type ReportShare, type ReportSnapshot } from "../services/report";

type Row = { share: ReportShare; report: ReportSnapshot | null };

function fmtDate(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleDateString();
}

export default function SharedReportsPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    reportService.getSharedWithMe().then(async (shares) => {
      const sorted = [...shares].sort((a, b) => Number(b.sharedAt - a.sharedAt));
      const reports = await Promise.all(sorted.map(s => reportService.getReport(s.reportId).catch(() => null)));
      setRows(sorted.map((share, i) => ({ share, report: reports[i] })));
      await Promise.all(sorted.filter(s => !s.seen).map(s => reportService.markShareSeen(s.id)));
    }).finally(() => setLoading(false));
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t("sharedReports.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          {t("sharedReports.goToSignIn")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{t("sharedReports.title")}</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {t("sharedReports.subtitle")}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: "center", color: T.muted }}>{t("common.loading")}</div>
        ) : rows.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted, textAlign: "center" }}>{t("sharedReports.empty")}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map(({ share, report }) => (
              <button
                key={share.id}
                onClick={() => navigate(`/report/${share.reportId}`)}
                disabled={!report}
                style={{
                  padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 8, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between",
                  opacity: report ? 1 : 0.5,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {report ? report.displayName : t("sharedReports.unavailable")}
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                    {t("sharedReports.sharedOn", { date: fmtDate(share.sharedAt) })}
                    {report && ` · ${Number(report.avgScore)}% ${t("sharedReports.avg")}`}
                  </div>
                </div>
                <span style={{ color: T.muted }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
