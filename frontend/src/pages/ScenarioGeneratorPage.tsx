import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
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
  const { t } = useTranslation();
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
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font }}>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 22, color: T.text }}>{t("moderation.signInRequired")}</div>
      </div>
    );
  }
  if (checkingAdmin) {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80, fontFamily: T.font }}>{t("scenarioGen.checkingAccess")}</div>;
  }
  if (!isAdmin) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font }}>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 22, color: T.text, marginBottom: 8 }}>{t("scenarioGen.adminsOnly")}</div>
        <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted }}>{t("scenarioGen.adminsOnlyDesc")}</div>
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
      setError(e?.message ?? t("scenarioGen.generationFailed"));
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
      setError(t("scenarioGen.parseFailed", { message: e?.message ?? e }));
    }
  }

  async function handleApprove(i: number) {
    if (!parsed) return;
    const q = parsed[i];
    setApprovals(a => ({ ...a, [i]: "saving" }));
    try {
      await questionService.addQuestion({
        sportId, articleId,
        citation: q.citation, stem: q.stem, choices: q.choices,
        correctId: q.correctId, explanation: q.explanation,
        difficulty: toDifficulty(q.difficulty),
        isCasebook: false, isPointOfEmphasis: false,
      });
      setApprovals(a => ({ ...a, [i]: "saved" }));
    } catch {
      setApprovals(a => ({ ...a, [i]: "error" }));
    }
  }

  const selectedSport = sports.find(s => s.id === sportId);
  const selectedArticle = articles.find(a => a.id === articleId);

  return (
    <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font, display: "flex", flexDirection: "column", paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ background: T.panelAlt, padding: "56px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text, lineHeight: 1.05 }}>
            {t("scenarioGen.title")}
          </div>
          <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.09em", color: fill.wrong }}>
            REVIEW REQUIRED
          </span>
        </div>
        <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, color: T.muted, marginTop: 5 }}>
          {t("scenarioGen.subtitle")}
        </div>
      </div>

      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Sport + Article selectors (2-col) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: T.faint }}>
              {t("scenarioGen.sportLabel").toUpperCase()}
            </div>
            <div style={{ position: "relative" }}>
              <select
                value={sportId}
                onChange={e => setSportId(e.target.value)}
                style={{ width: "100%", minHeight: 46, padding: "0 36px 0 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.font, fontSize: 13, appearance: "none", cursor: "pointer" }}
              >
                {sports.map(s => <option key={s.id} value={s.id}>{s.displayName}</option>)}
              </select>
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.faint, pointerEvents: "none" }}>▾</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: T.faint }}>
              {t("scenarioGen.articleLabel").toUpperCase()}
            </div>
            <div style={{ position: "relative" }}>
              <select
                value={articleId}
                onChange={e => setArticleId(e.target.value)}
                style={{ width: "100%", minHeight: 46, padding: "0 36px 0 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.font, fontSize: 13, appearance: "none", cursor: "pointer" }}
              >
                {articles.map(a => <option key={a.id} value={a.id}>Art. {Number(a.number)}</option>)}
              </select>
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: T.faint, pointerEvents: "none" }}>▾</span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: T.faint }}>
            {t("scenarioGen.instructionsLabel").toUpperCase()}
          </div>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder={t("scenarioGen.instructionsPlaceholder")}
            rows={3}
            style={{
              minHeight: 74, padding: "12px 14px",
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
              color: instructions ? T.text : T.faint, fontFamily: T.font, fontSize: 13.5, lineHeight: 1.5,
              resize: "vertical",
            }}
          />
        </div>

        {/* Count stepper */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontFamily: T.font, fontWeight: 400, fontSize: 14, color: T.text }}>
            {t("scenarioGen.countLabel")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setCount(c => Math.max(1, c - 1))}
              style={{ width: 44, height: 44, borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.font, fontSize: 19, cursor: "pointer" }}
            >−</button>
            <span style={{ minWidth: 32, textAlign: "center", fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 21, color: fill.accent }}>
              {count}
            </span>
            <button
              onClick={() => setCount(c => Math.min(10, c + 1))}
              style={{ width: 44, height: 44, borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.font, fontSize: 19, cursor: "pointer" }}
            >+</button>
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating || !articleId}
          style={{
            width: "100%", minHeight: 50,
            background: generating || !articleId ? T.border : fill.accent,
            color: fill.onAccent, border: 0, borderRadius: 8,
            fontFamily: T.font, fontSize: 15, fontWeight: 600,
            cursor: generating || !articleId ? "default" : "pointer",
          }}
        >
          {generating ? t("scenarioGen.generating") : t("scenarioGen.generateButton")}
        </button>

        {error && (
          <div style={{ padding: "12px 14px", background: T.surface, border: `1px solid ${fill.wrong}`, borderRadius: 8, fontFamily: T.font, fontSize: 12, color: fill.wrong }}>
            {error}
          </div>
        )}

        {/* Raw response (parse fallback) */}
        {rawResponse && !parsed && (
          <div>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: T.faint, marginBottom: 7 }}>
              {t("scenarioGen.rawResponseLabel").toUpperCase()}
            </div>
            <textarea
              value={rawResponse}
              onChange={e => setRawResponse(e.target.value)}
              rows={8}
              style={{ width: "100%", padding: 10, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: T.fontMono, fontSize: 11, color: T.text, resize: "vertical" }}
            />
            <button
              onClick={() => tryParse(rawResponse)}
              style={{ marginTop: 8, padding: "10px 16px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {t("scenarioGen.parsePreview")}
            </button>
          </div>
        )}

        {/* Generated questions */}
        {parsed && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ height: 1, background: T.border }} />
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
              {t("scenarioGen.questionsGenerated", { count: parsed.length })} · {Object.values(approvals).filter(s => s === "saved").length} APPROVED
            </div>

            {parsed.map((q, i) => {
              const state = approvals[i] ?? "idle";
              const saved = state === "saved";
              return (
                <div
                  key={i}
                  style={{
                    padding: "14px 16px", background: T.surface,
                    border: `1px solid ${saved ? "rgba(120,200,150,.45)" : T.border}`,
                    borderRadius: 10,
                    display: saved ? "flex" : "block",
                    alignItems: saved ? "center" : undefined,
                    justifyContent: saved ? "space-between" : undefined,
                    gap: saved ? 12 : undefined,
                  }}
                >
                  {saved ? (
                    <>
                      <span style={{ fontFamily: T.font, fontWeight: 500, fontSize: 13.5, color: "rgba(243,244,241,0.75)" }}>
                        {q.citation} — {q.stem.slice(0, 60)}{q.stem.length > 60 ? "…" : ""}
                      </span>
                      <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.09em", color: fill.accent, flexShrink: 0 }}>
                        SAVED
                      </span>
                    </>
                  ) : (
                    <>
                      <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.08em", color: T.faint }}>
                        {q.citation} · {q.difficulty.toUpperCase()}
                      </div>
                      <div style={{ fontFamily: T.font, fontWeight: 500, fontSize: 14, lineHeight: 1.45, color: T.text, margin: "8px 0" }}>
                        {q.stem}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 11 }}>
                        {q.choices?.map(c => (
                          <div key={c.id} style={{ fontFamily: T.font, fontSize: 12.5, lineHeight: 1.4, color: c.id === q.correctId ? fill.accent : "rgba(243,244,241,0.6)", fontWeight: c.id === q.correctId ? 600 : 400 }}>
                            {c.id.toUpperCase()}. {c.text}{c.id === q.correctId ? " ✓" : ""}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontFamily: T.font, fontSize: 12, lineHeight: 1.5, color: T.muted, marginTop: 10 }}>
                        {q.explanation}
                      </div>
                      <button
                        onClick={() => handleApprove(i)}
                        disabled={state === "saving" || state === "saved"}
                        style={{
                          width: "100%", minHeight: 44, marginTop: 12, background: "transparent",
                          border: `1px solid ${state === "error" ? fill.wrong : T.border}`,
                          borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 13,
                          color: state === "error" ? fill.wrong : T.text,
                          opacity: state === "saving" ? 0.6 : 1,
                          cursor: state === "saving" || state === "saved" ? "default" : "pointer",
                        }}
                      >
                        {state === "saving" ? t("scenarioGen.saving") : state === "saved" ? t("scenarioGen.saved") : state === "error" ? t("scenarioGen.retryFailed") : t("scenarioGen.approve")}
                      </button>
                    </>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => navigate("/me")}
              style={{ width: "100%", minHeight: 44, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 13, color: T.text, marginTop: 4, cursor: "pointer" }}
            >
              {t("scenarioGen.done")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
