import { useLocation, useNavigate } from "react-router-dom";
import { T, fill } from "../tokens";

const tabs = [
  { path: "/home",  label: "HOME"  },
  { path: "/study", label: "STUDY" },
  { path: "/exam",  label: "EXAM"  },
  { path: "/ranks", label: "RANKS" },
  { path: "/me",    label: "ME"    },
] as const;

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // Cert exam sim, commute mode and public report cards are full-screen — no chrome.
  if (
    location.pathname.startsWith("/exam-sim") ||
    location.pathname.startsWith("/commute") ||
    location.pathname.startsWith("/report/")
  ) return null;

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 430,
      display: "flex", background: T.panel, borderTop: `1px solid ${T.border}`,
      zIndex: 100,
    }}>
      {tabs.map((tab) => {
        const active = location.pathname === tab.path ||
          (tab.path !== "/home" && location.pathname.startsWith(tab.path));
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              flex: 1,
              padding: "13px 0 14px",
              background: "transparent",
              border: 0,
              borderTop: active ? `2px solid ${fill.accent}` : "2px solid transparent",
              color: active ? T.text : T.faint,
              fontFamily: T.fontMono,
              fontSize: 9.5,
              letterSpacing: "0.09em",
              fontWeight: active ? 600 : 500,
              minHeight: 48,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
