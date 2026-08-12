import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
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

// Practice sets generated here are personalized and ephemeral — shown once,
// scored locally, and never written to the shared question bank (unlike the
// admin scenario generator, which requires review before that happens).
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
          return {
            articleId: p.articleId,
            title: a ? a.title : p.articleId,
            citation: a ? `Art. ${Number(a.number)}` : "",
            mastery: Number(p.masteryScore),
          };
        }));
      })
      .catch(() => {})
      .finally(() => setLoadingWeak(false));
  }, [isAuthenticated, sportId, levelId]);

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{t("aiDrills.signInPrompt")}</div>
        <button onClick={() => navigate("/me")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
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
    <div style={{ paddingBottom: 24 }}>
      <div style={{ background: T.navy, padding: "52px 20px 16px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>🎯 {t("aiDrills.title")}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          {t("aiDrills.subtitle")}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {!questions && (
          <>
            {loadingWeak ? (
              <div style={{ textAlign: "center", color: T.muted, padding: 24 }}>{t("aiDrills.loadingWeak")}</div>
            ) : (
              <>
                {weakest.length > 0 ? (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("aiDrills.targeting")}</div>
                    {weakest.map(w => (
                      <div key={w.articleId} style={{ padding: "10px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                        {w.citation} — {w.title} <span style={{ color: T.muted }}>({t("aiDrills.masteryPct", { pct: w.mastery })})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
                    {t("aiDrills.noWeakAreas")}
                  </div>
                )}
                {error && (
                  <div style={{ padding: 12, background: "#FDECEA", border: `1px solid ${T.wrong}`, borderRadius: 8, fontSize: 12, color: T.wrong, marginBottom: 16 }}>
                    {error}
                  </div>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  style={{ width: "100%", padding: "14px", background: T.red, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700, opacity: generating ? 0.6 : 1 }}
                >
                  {generating ? t("aiDrills.generating") : t("aiDrills.generateButton")}
                </button>
              </>
            )}
          </>
        )}

        {questions && index < questions.length && (() => {
          const q = questions[index];
          return (
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>{t("aiDrills.questionOf", { current: index + 1, total: questions.length })}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, lineHeight: 1.5 }}>{q.stem}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {q.choices.map(c => {
                  let bg = T.surface, border = T.border, color = T.text;
                  if (chosen) {
                    if (c.id === q.correctId) { bg = "#E6F4EC"; border = T.correct; color = T.correct; }
                    else if (c.id === chosen) { bg = "#FDECEA"; border = T.wrong; color = T.wrong; }
                  }
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleChoice(c.id)}
                      disabled={!!chosen}
                      style={{ textAlign: "left", padding: "12px 14px", background: bg, border: `1px solid ${border}`, borderRadius: 8, fontSize: 13, color }}
                    >
                      <span style={{ fontWeight: 700, marginRight: 8 }}>{c.id.toUpperCase()}</span>
                      {c.text}
                    </button>
                  );
                })}
              </div>
              {chosen && (
                <div style={{ marginTop: 14, padding: "12px 14px", background: T.bg, borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{q.citation}</div>
                  <div>{q.explanation}</div>
                  <button
                    onClick={handleNext}
                    style={{ marginTop: 12, width: "100%", padding: "12px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
                  >
                    {index + 1 < questions.length ? t("aiDrills.nextQuestion") : t("aiDrills.seeResults")}
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {questions && index >= questions.length && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{t("aiDrills.correctOf", { correct: correctCount, total: questions.length })}</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>{t("aiDrills.notSaved")}</div>
            <button
              onClick={() => setQuestions(null)}
              style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
            >
              {t("aiDrills.generateAnother")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
