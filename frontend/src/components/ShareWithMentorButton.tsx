import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { mentorshipService, type AnswerSnapshot } from "../services/mentorship";
import { useAuthStore } from "../store/authStore";

type Props = {
  examId:         string | null;
  sportId:        string;
  score:          number;
  avgElapsedSec:  number | null;
  answers:        AnswerSnapshot[];
};

// Drop-in "Share with mentor" action for exam results screens (issue #18).
// Snapshots the report at share time and mints a 30-day link the mentor
// claims on first open — see backend/mentorship/main.mo for the access model.
export default function ShareWithMentorButton({ examId, sportId, score, avgElapsedSec, answers }: Props) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [state, setState] = useState<"idle" | "sharing" | "shared" | "error">("idle");
  const [link, setLink] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const disabled = !isAuthenticated || !examId || state === "sharing";

  async function handleShare() {
    if (!examId) return;
    setState("sharing");
    setErrorMsg(null);
    try {
      const result = await mentorshipService.createMentorLink(examId, sportId, score, avgElapsedSec, answers);
      const url = `${window.location.origin}/mentor/${result.token}`;
      setLink(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      setState("shared");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Couldn't create a share link — try again.");
      setState("error");
    }
  }

  if (state === "shared" && link) {
    return (
      <div style={{
        padding: 16, background: "#EEF3FC", border: `1px solid ${T.navy}`,
        borderRadius: 8, textAlign: "center", marginTop: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
          🧑‍🏫 Link {copied ? "copied" : "ready"} — share it with your mentor
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
          Expires in 30 days · revocable anytime from your Mentorship page
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(link).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            style={{ padding: "9px 16px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 12, fontWeight: 700 }}
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <button
            onClick={() => navigate("/mentor")}
            style={{ padding: "9px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, fontWeight: 700 }}
          >
            Manage Shares
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <button
        onClick={handleShare}
        disabled={disabled}
        style={{
          width: "100%", padding: "12px 0",
          background: disabled ? T.border : T.surface,
          border: `1px solid ${disabled ? T.border : T.navy}`,
          color: disabled ? T.muted : T.navy,
          borderRadius: 8, fontSize: 13, fontWeight: 700,
        }}
      >
        {state === "sharing" ? "Creating link…" : "🧑‍🏫 Share with Mentor"}
      </button>
      {!isAuthenticated && (
        <div style={{ fontSize: 11, color: T.muted, marginTop: 6, textAlign: "center" }}>
          Sign in to share results with a mentor.
        </div>
      )}
      {errorMsg && (
        <div style={{ fontSize: 11, color: T.wrong, marginTop: 6, textAlign: "center" }}>{errorMsg}</div>
      )}
    </div>
  );
}
