import { useLocation, useNavigate } from "react-router-dom";
import { T } from "../tokens";

const tabs = [
  { path: "/home",  label: "Home",  icon: "⊞" },
  { path: "/study", label: "Study", icon: "📖" },
  { path: "/exam",  label: "Exam",  icon: "✏️" },
  { path: "/ranks", label: "Ranks", icon: "🏆" },
  { path: "/me",    label: "Me",    icon: "👤" },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // The certification exam simulation and Commute Mode are full-screen,
  // distraction-free modes (see issues #16, #17) — no tab bar while active.
  // "/report/:id" is the public, possibly-unauthenticated report card view
  // (see issue #22) — no app chrome for external viewers like assignors.
  if (
    location.pathname.startsWith("/exam-sim") ||
    location.pathname.startsWith("/commute") ||
    location.pathname.startsWith("/report/")
  ) return null;

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      display: "flex", background: T.surface, borderTop: `1px solid ${T.border}`,
      zIndex: 100,
    }}>
      {tabs.map((tab) => {
        const active = location.pathname === tab.path;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              flex: 1, padding: "10px 0 8px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: "transparent",
              color: active ? T.red : T.muted,
              fontSize: 10, fontWeight: active ? 700 : 400,
              borderTop: active ? `2px solid ${T.red}` : "2px solid transparent",
            }}
          >
            <span style={{ fontSize: 20 }}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
