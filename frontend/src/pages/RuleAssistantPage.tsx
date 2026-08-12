import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";
import { contentService, type Article } from "../services/content";
import { aiProxyService, type RateLimitStatus } from "../services/aiProxy";

type ChatMessage = { role: "user" | "assistant" | "error"; text: string };

// Chat history is intentionally kept only in this component's state — never
// written to canister storage or localStorage — so it's gone the moment the
// session ends, matching the "not persisted across sessions" requirement.
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
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{t("ruleAssistant.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={{ background: T.navy, padding: "52px 20px 16px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>🤖 {t("ruleAssistant.title")}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          {t("ruleAssistant.subtitle")}
        </div>
      </div>

      {!configured && (
        <div style={{ margin: 16, padding: 12, background: "#FFF6DC", border: "1px solid #D9A400", borderRadius: 8, fontSize: 12, color: "#7A5B00" }}>
          {t("ruleAssistant.notConfigured")}
        </div>
      )}

      <div style={{ padding: "12px 16px 0" }}>
        <label style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 4 }}>
          {t("ruleAssistant.groundInArticle")}
        </label>
        <select
          value={articleId}
          onChange={e => setArticleId(e.target.value)}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, background: T.surface }}
        >
          <option value="">{t("ruleAssistant.noSpecificArticle")}</option>
          {articles.map(a => (
            <option key={a.id} value={a.id}>Art. {Number(a.number)} — {a.title}</option>
          ))}
        </select>
      </div>

      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 13, color: T.muted, textAlign: "center", marginTop: 24 }}>
            {t("ruleAssistant.examplePrompt")}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "85%",
            padding: "10px 14px",
            borderRadius: 12,
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            background: m.role === "user" ? T.navy : m.role === "error" ? "#FDECEA" : T.surface,
            color: m.role === "user" ? T.white : m.role === "error" ? T.wrong : T.text,
            border: m.role === "assistant" ? `1px solid ${T.border}` : m.role === "error" ? `1px solid ${T.wrong}` : "none",
          }}>
            {m.text}
          </div>
        ))}
        {asking && (
          <div style={{ alignSelf: "flex-start", fontSize: 12, color: T.muted, padding: "6px 14px" }}>
            {t("ruleAssistant.thinking")}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: 16, borderTop: `1px solid ${T.border}`, background: T.surface }}>
        {rateLimit && (
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>
            {t("ruleAssistant.questionsUsedToday", { used: rateLimit.used, limit: rateLimit.limitPerDay })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAsk(); }}
            placeholder={outOfQuestions ? t("ruleAssistant.limitReached") : t("ruleAssistant.inputPlaceholder")}
            disabled={asking || outOfQuestions}
            style={{ flex: 1, padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13 }}
          />
          <button
            onClick={handleAsk}
            disabled={asking || outOfQuestions || !input.trim()}
            style={{
              padding: "12px 20px", background: T.navy, color: T.white, borderRadius: 8,
              fontSize: 13, fontWeight: 700, opacity: (asking || outOfQuestions || !input.trim()) ? 0.5 : 1,
            }}
          >
            {t("ruleAssistant.ask")}
          </button>
        </div>
      </div>
    </div>
  );
}
