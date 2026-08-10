import { useNavigate } from "react-router-dom";
import { T } from "../tokens";

const ARTICLES = [
  { id: "ncaa_basketball:art1", number: 1, title: "Court and Equipment",  done: true  },
  { id: "ncaa_basketball:art2", number: 2, title: "Players and Rosters",  done: true  },
  { id: "ncaa_basketball:art3", number: 3, title: "Officials",            done: false },
  { id: "ncaa_basketball:art4", number: 4, title: "Fouls",                done: false },
  { id: "ncaa_basketball:art5", number: 5, title: "Violations",           done: false },
];

export default function StudyPage() {
  const navigate = useNavigate();

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>📖 Study</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>NCAA Men's Basketball</div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {ARTICLES.map((a) => (
          <button
            key={a.id}
            onClick={() => navigate(`/quiz/${a.id}`)}
            style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "14px 16px",
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 10, textAlign: "left",
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: a.done ? "#E6F4EC" : T.navy,
              color: a.done ? T.correct : T.white,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 14, flexShrink: 0,
            }}>
              {a.done ? "✓" : a.number}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Article {a.number}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{a.title}</div>
            </div>
            <span style={{ color: T.muted, fontSize: 18 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
