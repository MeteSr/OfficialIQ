import { T } from "../tokens";

export default function MePage() {
  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>👤 Profile</div>
      </div>
      <div style={{ padding: 24, textAlign: "center", color: T.muted }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Connect with Internet Identity</div>
        <div style={{ fontSize: 13 }}>Sign in to track your progress and compete on the leaderboard.</div>
        <button style={{
          marginTop: 24, padding: "13px 32px",
          background: T.navy, color: T.white,
          borderRadius: 8, fontSize: 15, fontWeight: 700,
        }}>Sign In</button>
      </div>
    </div>
  );
}
