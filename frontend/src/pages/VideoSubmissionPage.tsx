import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { contentService, type VideoSubmission } from "../services/content";

function statusLabel(s: VideoSubmission["status"]): string {
  if ("Approved" in s) return "Approved";
  if ("Rejected" in s) return "Not used";
  return "Pending review";
}
function statusColor(s: VideoSubmission["status"]): string {
  if ("Approved" in s) return T.correct;
  if ("Rejected" in s) return T.muted;
  return "#D9A400";
}

export default function VideoSubmissionPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [citation, setCitation] = useState("");
  const [clipUrl,  setClipUrl]  = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);
  const [mine,     setMine]     = useState<VideoSubmission[]>([]);

  function loadMine() {
    contentService.getMySubmissions().then((s) => {
      setMine([...s].sort((a, b) => Number(b.createdAt - a.createdAt)));
    }).catch(() => {});
  }

  useEffect(() => { if (isAuthenticated) loadMine(); }, [isAuthenticated]);

  async function handleSubmit() {
    if (!citation.trim() || !clipUrl.trim()) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await contentService.submitVideoClip(citation.trim(), clipUrl.trim());
      setCitation("");
      setClipUrl("");
      setSuccess(true);
      loadMine();
    } catch (e: any) {
      setError(e.message ?? "Couldn't submit this clip — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Sign in to submit a video clip.</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🎬</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Submit a Clip</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          Share a public-game clip illustrating a casebook play
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 16 }}>
          Submissions are reviewed before they're linked to a casebook play. Only submit clips
          you have the right to share — do not submit copyrighted broadcast footage without permission.
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>Article / Citation</div>
        <input
          value={citation}
          onChange={e => setCitation(e.target.value)}
          placeholder='e.g. "Art. 4-2, Case 1"'
          style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, marginBottom: 12, boxSizing: "border-box" }}
        />

        <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>Clip URL</div>
        <input
          value={clipUrl}
          onChange={e => setClipUrl(e.target.value)}
          placeholder="https://..."
          style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, marginBottom: 16, boxSizing: "border-box" }}
        />

        {error && <div style={{ color: T.wrong, fontSize: 12, marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ color: T.correct, fontSize: 12, marginBottom: 12 }}>Submitted — thanks! It'll appear below once reviewed.</div>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !citation.trim() || !clipUrl.trim()}
          style={{
            width: "100%", padding: "13px 0",
            background: submitting || !citation.trim() || !clipUrl.trim() ? T.border : T.red,
            color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700, marginBottom: 24,
          }}
        >
          {submitting ? "Submitting…" : "Submit Clip"}
        </button>

        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Your Submissions</div>
        {mine.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted }}>No submissions yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mine.map((s) => (
              <div key={s.id} style={{ padding: "10px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.citation}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2, wordBreak: "break-all" }}>{s.clipUrl}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: statusColor(s.status), marginTop: 4 }}>
                  {statusLabel(s.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
