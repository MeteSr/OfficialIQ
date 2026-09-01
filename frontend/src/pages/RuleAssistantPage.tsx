import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";
import { contentService, type Article } from "../services/content";
import { aiProxyService, type RateLimitStatus } from "../services/aiProxy";

type ChatMessage = { role: "user" | "assistant" | "error"; text: string };

// Chat history is kept only in component state — never persisted to canister
// storage or localStorage — so it ends with the session.
export default function RuleAssistantPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { sportId, levelId } = useSport();
  const { t } = useTranslation();

  const [configured, setConfigured] = useState(true);
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleId, setArticleId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    contentService.listArticles(sportId, levelId).then(arts => {
      setArticles([...arts].sort((a, b) => Number(a.number) - Number(b.number)));
    }).catch(() => {});
    aiProxyService.isConfigured().then(setConfigured).catch(() => {});
    aiProxyService.getRateLimitStatus().then(setRateLimit).catch(() => {});
  }, [isAuthenticated, sportId, levelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: T.text }}>{t("ruleAssistant.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "13px 32px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          {t("addFriend.goToProfile")}
        </button>
      </div>
    );
  }

  async function handleAsk() {
    const question = input.trim();
    if (!question || asking) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: question }]);
    setAsking(true);
    try {
      const article = articles.find(a => a.id === articleId);
      const context = article ? `${article.title}\n${article.body}`.slice(0, 3000) : "";
      const answer = await aiProxyService.askRuleAssistant(question, context);
      setMessages(m => [...m, { role: "assistant", text: answer }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: "error", text: e?.message ?? t("ruleAssistant.askFailed") }]);
    } finally {
      setAsking(false);
      aiProxyService.getRateLimitStatus().then(setRateLimit).catch(() => {});
    }
  }

  const outOfQuestions = !!rateLimit && rateLimit.used >= rateLimit.limitPerDay;
  const selectedArticle = articles.find(a => a.id === articleId);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", background: T.bg, fontFamily: T.font }}>
      {/* Header */}
      <div style={{ background: T.panelAlt, padding: "56px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text, lineHeight: 1.05 }}>
            {t("ruleAssistant.title")}
          </div>
          <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.09em", color: fill.attention }}>
            NOT SAVED
          </span>
        </div>
        <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, color: T.muted, marginTop: 5 }}>
          {t("ruleAssistant.subtitle")}
        </div>
      </div>

      {!configured && (
        <div style={{ margin: "14px 16px 0", padding: "12px 14px", background: T.surface, border: `1px solid ${fill.attention}`, borderRadius: 8, fontFamily: T.font, fontSize: 12.5, color: fill.attention }}>
          {t("ruleAssistant.notConfigured")}
        </div>
      )}

      {/* Article grounding selector */}
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: T.faint, marginBottom: 7 }}>
          {t("ruleAssistant.groundInArticle").toUpperCase()}
        </div>
        <div style={{ position: "relative" }}>
          <select
            value={articleId}
            onChange={e => setArticleId(e.target.value)}
            style={{
              width: "100%", minHeight: 46, padding: "0 40px 0 14px",
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
              color: T.text, fontFamily: T.font, fontSize: 13.5, appearance: "none",
              cursor: "pointer",
            }}
          >
            <option value="">{t("ruleAssistant.noSpecificArticle")}</option>
            {articles.map(a => (
              <option key={a.id} value={a.id}>Art. {Number(a.number)} — {a.title}</option>
            ))}
          </select>
          <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: T.faint, pointerEvents: "none" }}>▾</span>
        </div>
      </div>

      {/* Message thread */}
      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        {messages.length === 0 && (
          <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted, textAlign: "center", marginTop: 24 }}>
            {t("ruleAssistant.examplePrompt")}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: m.role === "user" ? "85%" : "88%",
              padding: "11px 14px",
              borderRadius: 12,
              fontFamily: T.font, fontSize: 13.5, lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              background: m.role === "user" ? fill.accent : m.role === "error" ? T.surface : T.surface,
              color: m.role === "user" ? fill.onAccent : m.role === "error" ? fill.wrong : "rgba(243,244,241,0.85)",
              border: m.role === "user" ? "none" : m.role === "error" ? `1px solid ${fill.wrong}` : `1px solid ${T.border}`,
            }}
          >
            {m.text}
          </div>
        ))}
        {asking && (
          <div style={{ alignSelf: "flex-start", fontFamily: T.fontMono, fontWeight: 500, fontSize: 11, letterSpacing: "0.08em", color: T.faint, padding: "8px 14px" }}>
            THINKING…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div style={{ padding: "14px 16px 16px", borderTop: `1px solid ${T.border}`, background: T.panel }}>
        {rateLimit && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: T.border, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round((rateLimit.used / rateLimit.limitPerDay) * 100)}%`, background: fill.accent }} />
            </div>
            <span style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, color: T.faint, whiteSpace: "nowrap" }}>
              {rateLimit.used} OF {rateLimit.limitPerDay} TODAY
            </span>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAsk(); }}
            placeholder={outOfQuestions ? t("ruleAssistant.limitReached") : t("ruleAssistant.inputPlaceholder")}
            disabled={asking || outOfQuestions}
            style={{
              flex: 1, minHeight: 48, padding: "0 14px",
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
              color: T.text, fontFamily: T.font, fontSize: 13.5,
            }}
          />
          <button
            onClick={handleAsk}
            disabled={asking || outOfQuestions || !input.trim()}
            style={{
              minHeight: 48, padding: "0 20px", background: fill.accent, color: fill.onAccent,
              border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 13,
              opacity: (asking || outOfQuestions || !input.trim()) ? 0.5 : 1,
              cursor: (asking || outOfQuestions || !input.trim()) ? "default" : "pointer",
            }}
          >
            {t("ruleAssistant.ask")}
          </button>
        </div>
      </div>
    </div>
  );
}
