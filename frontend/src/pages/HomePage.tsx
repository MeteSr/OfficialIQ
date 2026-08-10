import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { challengeService, type Challenge } from "../services/challenge";
import { rankingService, type UserStats } from "../services/ranking";
import { userService } from "../services/user";

export default function HomePage() {
  const navigate   = useNavigate();
  const { profile, principal, isAuthenticated } = useAuthStore();
  const [stats,      setStats]      = useState<UserStats | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [names,       setNames]     = useState<Record<string, string>>({});
  const [accepting,   setAccepting] = useState<string | null>(null);

  function refreshChallenges() {
    challengeService.getMyChallenges().then(async (cs) => {
      setChallenges(cs);
      const incoming = cs.filter(c => "Pending" in c.status && c.challenged.toString() === principal);
      const resolved = await Promise.all(incoming.map(async (c) => {
        const key = c.challenger.toString();
        const prof = await userService.getProfile(c.challenger).catch(() => null);
        return [key, prof?.displayName ?? "an official"] as const;
      }));
      setNames(Object.fromEntries(resolved));
    }).catch(() => {});
  }

  useEffect(() => {
    rankingService.getMyStats().then(setStats).catch(() => {});
    if (principal) refreshChallenges();
  }, [isAuthenticated, principal]);

  async function handleAccept(id: string) {
    setAccepting(id);
    try {
      await challengeService.acceptChallenge(id);
      navigate(`/challenge/${id}`);
    } catch {
      // leave it in the inbox; user can retry
    } finally {
      setAccepting(null);
    }
  }

  const pending = challenges.filter(c => "Pending" in c.status && c.challenged.toString() === principal);
  const streak  = stats?.streak ?? 14n;
  const accuracy = stats ? Math.round(stats.accuracy * 100) : 84;

  return (
    <div style={{ paddingBottom: 16 }}>
      {/* Header */}
      <div style={{
        background: T.navy, color: T.white,
        padding: "52px 20px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: `2px solid ${T.red}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>🛡</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>OfficialIQ</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ background: T.red, borderRadius: 12, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
            🔴 {streak.toString()}
          </span>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: T.muted,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 13, color: T.white,
          }}>
            {profile?.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
        </div>
      </div>

      {/* Stat row */}
      <div style={{ background: T.navy, display: "flex", padding: "0 20px 20px" }}>
        {[
          { value: streak.toString(),  label: "Day Streak", icon: "🔥" },
          { value: "#47",              label: "State Rank",  icon: "📊" },
          { value: `${accuracy}%`,     label: "Accuracy",    icon: "🎯" },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1, textAlign: "center", color: T.white }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.label === "State Rank" ? "#A8C4F5" : T.white }}>
              {s.value}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{s.label}</div>
            <div style={{ fontSize: 16, marginTop: 4 }}>{s.icon}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        {/* Weekly module */}
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 12, padding: "14px 16px", marginBottom: 12,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>This Week — Art. 4–5</span>
            <span style={{ fontSize: 12, color: T.muted }}>3/5 done</span>
          </div>
          <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ height: "100%", width: "60%", background: T.red, borderRadius: 2 }} />
          </div>
          <button
            onClick={() => navigate("/quiz/ncaa_basketball:art4")}
            style={{
              width: "100%", padding: "13px 0",
              background: T.red, color: T.white,
              borderRadius: 8, fontSize: 15, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            ▶ Continue Week 4 Study
          </button>
        </div>

        {/* Quick actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[
            { label: "Audio Mode", icon: "🎧", path: "/study" },
            { label: "Quick Drill", icon: "⚡", path: "/quiz/ncaa_basketball:art4" },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.path)}
              style={{
                padding: "14px 0", background: T.surface,
                border: `1px solid ${T.border}`, borderRadius: 10,
                fontSize: 14, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <span style={{ fontSize: 18 }}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>

        {/* Challenge inbox */}
        {pending.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((c) => (
              <div
                key={c.id}
                style={{
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 10, padding: "12px 16px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 14 }}>
                  Challenge from <strong>{names[c.challenger.toString()] ?? "an official"}</strong>
                </span>
                <button
                  onClick={() => handleAccept(c.id)}
                  disabled={accepting === c.id}
                  style={{ background: "transparent", color: T.red, fontWeight: 700, fontSize: 14 }}
                >
                  {accepting === c.id ? "Accepting…" : "Accept ›"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
