import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { reportService, type ReportSnapshot } from "../services/report";
import ReportCardView from "../components/ReportCardView";
import { exportOrPrint } from "../lib/exportPdf";

// Public, no-auth-required view — an assignor or coordinator clicking a
// shared link lands here without ever needing to sign in.
export default function PublicReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [report,  setReport]  = useState<ReportSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    reportService.getReport(id)
      .then((r) => {
        if (!r) { setError("This report card is private or doesn't exist."); return; }
        setReport(r);
      })
      .catch(() => setError("Couldn't load this report card."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>Loading…</div>;
  }

  if (error || !report) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{error ?? "Report card not found."}</div>
        <button onClick={() => navigate("/home")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          Go to OfficialIQ
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 16px" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .report-card, .report-card * { visibility: visible; }
          .report-card { position: absolute; top: 0; left: 0; width: 100%; border: none !important; }
        }
      `}</style>
      <ReportCardView report={report} />
      <button
        onClick={() => exportOrPrint("OfficialIQ Report Card")}
        style={{ width: "100%", maxWidth: 430, margin: "16px auto 0", display: "block", padding: "12px 0", background: T.navy, color: T.white, borderRadius: 8, fontSize: 14, fontWeight: 700 }}
      >
        🖨️ Print / Export PDF
      </button>
    </div>
  );
}
