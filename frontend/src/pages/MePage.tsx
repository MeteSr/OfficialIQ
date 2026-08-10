import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useAuth } from "../contexts/AuthContext";
import { rankingService, type UserStats } from "../services/ranking";
import { useEffect, useState } from "react";

export default function MePage() {
  const { isAuthenticated, profile, principal } = useAuthStore();
  const { login, logout } = useAuth();
  const [stats,   setStats]   = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    rankingService.getMyStats().then(setStats).catch(() => {});
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div>
        <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>👤 Profile</div>
        </div>
        <div style={{ padding: 24, textAlign: "center", color: T.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: T.text }}>
            Sign in with Internet Identity
          </div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>
            Track your progress and compete on the leaderboard.
          </div>
          <button
            onClick={async () => { setLoading(true); await login().catch(() => {}); setLoading(false); }}
            disabled={loading}
            style={{
              padding: "13px 32px", background: T.navy, color: T.white,
              borderRadius: 8, fontSize: 15, fontWeight: 700,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 24px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%",
            background: T.red, color: T.white,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700,
          }}>
            {profile?.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {profile?.displayName ?? "Official"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
              {profile?.sport ?? "ncaa_basketball"}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 8, wordBreak: "break-all" }}>
          {principal}
        </div>
      </div>

      {stats && (
        <div style={{
          display: "flex", padding: "16px 20px",
          borderBottom: `1px solid ${T.border}`,
        }}>
          {[
            { label: "Exams",    value: Number(stats.examCount) },
            { label: "Streak",   value: Number(stats.streak) },
            { label: "Accuracy", value: `${Math.round(stats.accuracy * 100)}%` },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.navy }}>{s.value}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: 16 }}>
        <button
          onClick={() => logout()}
          style={{
            width: "100%", padding: "12px 0",
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, fontSize: 14, color: T.wrong, fontWeight: 600,
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
