import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { contentService, type Article } from "../services/content";

export default function StudyPage() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    contentService.listArticles("ncaa_basketball", "varsity")
      .then(setArticles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>📖 Study</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          NCAA Men's Basketball
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              height: 64, background: T.border, borderRadius: 10,
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))
        ) : articles.map((a, idx) => {
          const done = idx < 2; // first 2 marked complete for demo
          return (
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
                background: done ? "#E6F4EC" : T.navy,
                color: done ? T.correct : T.white,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {done ? "✓" : Number(a.number)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Article {Number(a.number)}</div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{a.title}</div>
              </div>
              <span style={{ color: T.muted, fontSize: 18 }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
