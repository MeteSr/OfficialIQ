import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { contentService, type Article, type Sport } from "../services/content";
import { aiProxyService } from "../services/aiProxy";
import { questionService, type Difficulty } from "../services/question";

type GeneratedQuestion = {
  stem: string;
  choices: { id: string; text: string }[];
  correctId: string;
  explanation: string;
  citation: string;
  difficulty: string;
};

type ApprovalState = "idle" | "saving" | "saved" | "error";

function toDifficulty(d: string): Difficulty {
  if (d === "Beginner" || d === "Advanced" || d === "Expert") return { [d]: null } as Difficulty;
  return { Intermediate: null };
}

export default function ScenarioGeneratorPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [sports, setSports] = useState<Sport[]>([]);
  const [sportId, setSportId] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleId, setArticleId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [count, setCount] = useState(5);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [rawResponse, setRawResponse] = useState("");
  const [parsed, setParsed] = useState<GeneratedQuestion[] | null>(null);
  const [approvals, setApprovals] = useState<Record<number, ApprovalState>>({});

  useEffect(() => {
    if (!isAuthenticated) { setCheckingAdmin(false); return; }
    aiProxyService.isAdmin().then(a => { setIsAdmin(a); setCheckingAdmin(false); }).catch(() => setCheckingAdmin(false));
    contentService.listSports().then(s => {
      setSports(s);
      if (s.length > 0) setSportId(s[0].id);
    }).catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    if (!sportId) return;
    const level = sports.find(s => s.id === sportId)?.levels[0]?.id ?? "varsity";
    contentService.listArticles(sportId, level).then(arts => {
      const sorted = [...arts].sort((a, b) => Number(a.number) - Number(b.number));
      setArticles(sorted);
      setArticleId(sorted[0]?.id ?? "");
    }).catch(() => {});
  }, [sportId, sports]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🧪</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Sign in required</div>
      </div>
    );
  }
  if (checkingAdmin) {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>Checking access…</div>;
  }
  if (!isAdmin) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Admins only</div>
        <div style={{ fontSize: 13, color: T.muted }}>Scenario generation is restricted to content admins.</div>
      </div>
    );
  }

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    setParsed(null);
    setApprovals({});
    try {
      const article = articles.find(a => a.id === articleId);
      const articleContext = article ? `${article.title}\n${article.body}`.slice(0, 4000) : "";
      const raw = await aiProxyService.generateScenarios(instructions, articleContext, count);
      setRawResponse(raw);
      tryParse(raw);
    } catch (e: any) {
      setError(e?.message ?? "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  function tryParse(raw: string) {
    try {
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      if (start === -1 || end === -1) throw new Error("Response wasn't a JSON array");
      const items = JSON.parse(raw.slice(start, end + 1));
      if (!Array.isArray(items)) throw new Error("Response wasn't a JSON array");
      setParsed(items);
      setError("");
    } catch (e: any) {
      setParsed(null);
      setError(`Couldn't parse response as JSON: ${e?.message ?? e}`);
    }
  }

  async function handleApprove(i: number) {
    if (!parsed) return;
    const q = parsed[i];
    setApprovals(a => ({ ...a, [i]: "saving" }));
    try {
      await questionService.addQuestion({
        sportId,
        articleId,
        citation: q.citation,
        stem: q.stem,
        choices: q.choices,
        correctId: q.correctId,
        explanation: q.explanation,
        difficulty: toDifficulty(q.difficulty),
        isCasebook: false,
        isPointOfEmphasis: false,
      });
      setApprovals(a => ({ ...a, [i]: "saved" }));
    } catch {
      setApprovals(a => ({ ...a, [i]: "error" }));
    }
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ background: T.navy, padding: "52px 20px 16px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>🧪 AI Scenario Generator</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          Generate, review, then approve into the question bank.
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <label style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 4 }}>Sport</label>
        <select value={sportId} onChange={e => setSportId(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 12 }}>
          {sports.map(s => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>

        <label style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 4 }}>Article to ground questions in</label>
        <select value={articleId} onChange={e => setArticleId(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 12 }}>
          {articles.map(a => <option key={a.id} value={a.id}>Art. {Number(a.number)} — {a.title}</option>)}
        </select>

        <label style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 4 }}>Instructions</label>
        <textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder='e.g. "5 novel foul scenarios, difficulty: Advanced, focus on player-control fouls vs blocking fouls"'
          rows={3}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 12, fontFamily: T.font }}
        />

        <label style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 4 }}>Count</label>
        <input
          type="number" min={1} max={10} value={count}
          onChange={e => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, marginBottom: 16 }}
        />

        <button
          onClick={handleGenerate}
          disabled={generating || !articleId}
          style={{ width: "100%", padding: "14px", background: T.red, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700, opacity: generating ? 0.6 : 1, marginBottom: 16 }}
        >
          {generating ? "Generating…" : "Generate with Claude"}
        </button>

        {error && (
          <div style={{ padding: 12, background: "#FDECEA", border: `1px solid ${T.wrong}`, borderRadius: 8, fontSize: 12, color: T.wrong, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {rawResponse && !parsed && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>Raw response (edit then re-parse if needed)</div>
            <textarea
              value={rawResponse}
              onChange={e => setRawResponse(e.target.value)}
              rows={8}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 11, fontFamily: "monospace", marginBottom: 8 }}
            />
            <button onClick={() => tryParse(rawResponse)} style={{ padding: "10px 16px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
              Parse & Preview
            </button>
          </div>
        )}

        {parsed && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{parsed.length} question(s) generated</div>
            {parsed.map((q, i) => {
              const state = approvals[i] ?? "idle";
              return (
                <div key={i} style={{ padding: 14, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{q.citation} · {q.difficulty}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{q.stem}</div>
                  {q.choices?.map(c => (
                    <div key={c.id} style={{ fontSize: 12, padding: "4px 0", color: c.id === q.correctId ? T.correct : T.text, fontWeight: c.id === q.correctId ? 700 : 400 }}>
                      {c.id.toUpperCase()}. {c.text} {c.id === q.correctId ? "✓" : ""}
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>{q.explanation}</div>
                  <button
                    onClick={() => handleApprove(i)}
                    disabled={state === "saving" || state === "saved"}
                    style={{
                      marginTop: 10, width: "100%", padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      background: state === "saved" ? "#E6F4EC" : state === "error" ? "#FDECEA" : T.navy,
                      color: state === "saved" ? T.correct : state === "error" ? T.wrong : T.white,
                    }}
                  >
                    {state === "saving" ? "Saving…" : state === "saved" ? "✓ Added to question bank" : state === "error" ? "Failed — retry" : "Approve & Add to Question Bank"}
                  </button>
                </div>
              );
            })}
            <button onClick={() => navigate("/me")} style={{ width: "100%", padding: "12px", background: T.bg, color: T.text, borderRadius: 8, fontSize: 13, fontWeight: 600, marginTop: 4 }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
