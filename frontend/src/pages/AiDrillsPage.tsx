import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useSport } from "../lib/sport";
import { contentService, type Article } from "../services/content";
import { userService, type ArticleProgress } from "../services/user";
import { aiProxyService } from "../services/aiProxy";

type DrillQuestion = {
  stem: string;
  choices: { id: string; text: string }[];
  correctId: string;
  explanation: string;
  citation: string;
  difficulty: string;
};

function masteryColor(pct: number) {
  return pct >= 80 ? fill.accent : pct >= 60 ? fill.attention : fill.wrong;
}

function parseDrills(raw: string): DrillQuestion[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("AI response wasn't a JSON array");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("AI returned no questions");
  return parsed;
}

export default function AiDrillsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { sportId, levelId } = useSport();

  const [loadingWeak, setLoadingWeak] = useState(true);
  const [weakest, setWeakest] = useState<{ articleId: string; title: string; citation: string; mastery: number }[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<DrillQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) { setLoadingWeak(false); return; }
    Promise.all([userService.getMyProgress(), contentService.listArticles(sportId, levelId)])
      .then(([progress, articles]: [ArticleProgress[], Article[]]) => {
        const studied = progress.filter(p => Number(p.timesStudied) > 0);
        const weak = [...studied].sort((a, b) => Number(a.masteryScore) - Number(b.masteryScore)).slice(0, 3);
        setWeakest(weak.map(p => {
          const a = articles.find(x => x.id === p.articleId);
          return { articleId: p.articleId, title: a ? a.title : p.articleId, citation: a ? `Art. ${Number(a.number)}` : "", mastery: Number(p.masteryScore) };
        }));
      })
      .catch(() => {})
      .finally(() => setLoadingWeak(false));
  }, [isAuthenticated, sportId, levelId]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontFamily: T.font }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: T.text }}>{t("aiDrills.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "13px 32px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          {t("addFriend.goToProfile")}
        </button>
      </div>
    );
  }

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const context = weakest.length > 0
        ? weakest.map(w => `${w.citation} "${w.title}" — ${w.mastery}% mastery`).join("\n")
        : "This official hasn't studied enough yet to have identified weak areas — generate a general mixed-difficulty practice set instead.";
      const raw = await aiProxyService.generatePersonalizedDrills(context, 5);
      setQuestions(parseDrills(raw));
      setIndex(0);
      setChosen(null);
      setCorrectCount(0);
    } catch (e: any) {
      setError(e?.message ?? t("aiDrills.generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  function handleChoice(choiceId: string) {
    if (chosen) return;
    setChosen(choiceId);
    if (questions && choiceId === questions[index].correctId) setCorrectCount(c => c + 1);
  }

  function handleNext() {
    setChosen(null);
    setIndex(i => i + 1);
  }

  return (
    <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font, display: "flex", flexDirection: "column", paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ background: T.panelAlt, padding: "56px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text, lineHeight: 1.05 }}>
            {t("aiDrills.title")}
          </div>
          <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.09em", color: fill.attention }}>
            EPHEMERAL
          </span>
        </div>
        <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, color: T.muted, marginTop: 5 }}>
          {t("aiDrills.subtitle")}
        </div>
      </div>

      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Pre-question: targeting + generate */}
        {!questions && (
          <>
            {loadingWeak ? (
              <div style={{ textAlign: "center", color: T.muted, padding: 24, fontFamily: T.font }}>{t("aiDrills.loadingWeak")}</div>
            ) : (
              <>
                {weakest.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
                      {t("aiDrills.targeting")}
                    </div>
                    {weakest.map(w => (
                      <div key={w.articleId} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                        padding: "12px 14px", background: T.surface,
                        border: `1px solid ${T.border}`, borderLeft: `3px solid ${masteryColor(w.mastery)}`, borderRadius: 8,
                      }}>
                        <span style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, color: T.text }}>
                          {w.citation} — {w.title}
                        </span>
                        <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 17, color: masteryColor(w.mastery) }}>
                          {w.mastery}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {weakest.length === 0 && (
                  <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted }}>{t("aiDrills.noWeakAreas")}</div>
                )}
                {error && (
                  <div style={{ padding: "12px 14px", background: T.surface, border: `1px solid ${fill.wrong}`, borderRadius: 8, fontFamily: T.font, fontSize: 12, color: fill.wrong }}>
                    {error}
                  </div>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  style={{ width: "100%", minHeight: 50, background: generating ? T.border : fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontSize: 15, fontWeight: 600, cursor: generating ? "default" : "pointer" }}
                >
                  {generating ? t("aiDrills.generating") : t("aiDrills.generateButton")}
                </button>
              </>
            )}
          </>
        )}

        {/* Active question */}
        {questions && index < questions.length && (() => {
          const q = questions[index];
          const revealed = !!chosen;
          return (
            <div>
              <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.09em", color: T.faint }}>
                QUESTION {index + 1} OF {questions.length} · GENERATED
              </div>
              <p style={{ fontFamily: T.font, fontWeight: 500, fontSize: 15.5, lineHeight: 1.55, color: T.text, margin: "12px 0 0" }}>
                {q.stem}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 18 }}>
                {q.choices.map(c => {
                  const isPick = chosen === c.id;
                  const isCorrect = c.id === q.correctId;
                  let bg = T.surface, border = T.border, fg = T.text, keyColor = T.faint;
                  if (revealed) {
                    if (isCorrect) { bg = "rgba(120,200,150,0.13)"; border = fill.accent; fg = fill.accent; keyColor = fill.accent; }
                    else if (isPick) { bg = "rgba(220,120,100,0.13)"; border = fill.wrong; fg = fill.wrong; keyColor = fill.wrong; }
                  }
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleChoice(c.id)}
                      disabled={!!chosen}
                      style={{
                        minHeight: 52, padding: "13px 15px",
                        background: bg, border: `1px solid ${border}`,
                        borderRadius: 8, textAlign: "left", display: "flex", gap: 11, alignItems: "center",
                        fontFamily: T.font, fontSize: 14, lineHeight: 1.35, color: fg,
                        cursor: chosen ? "default" : "pointer",
                      }}
                    >
                      <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 12, minWidth: 14, color: keyColor }}>{c.id.toUpperCase()}</span>
                      <span style={{ flex: 1 }}>{c.text}</span>
                    </button>
                  );
                })}
              </div>

              {/* Reveal panel */}
              {chosen && (
                <div style={{ marginTop: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: fill.accent }}>
                      {q.citation}
                    </div>
                    <div style={{ fontFamily: T.font, fontSize: 13.5, lineHeight: 1.6, color: "rgba(243,244,241,0.8)", marginTop: 9 }}>
                      {q.explanation}
                    </div>
                    <button
                      onClick={handleNext}
                      style={{ width: "100%", minHeight: 46, marginTop: 14, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
                    >
                      {index + 1 < questions.length ? t("aiDrills.nextQuestion") : t("aiDrills.seeResults")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Results */}
        {questions && index >= questions.length && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 48, color: fill.accent, lineHeight: 1 }}>
              {correctCount}/{questions.length}
            </div>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", color: T.faint, marginTop: 8 }}>
              CORRECT
            </div>
            <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted, marginTop: 8, marginBottom: 24 }}>
              {t("aiDrills.notSaved")}
            </div>
            <button
              onClick={() => setQuestions(null)}
              style={{ padding: "13px 32px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
            >
              {t("aiDrills.generateAnother")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
