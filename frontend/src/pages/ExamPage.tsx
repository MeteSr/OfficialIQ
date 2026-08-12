import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { examService } from "../services/exam";
import { questionService } from "../services/question";
import { contentService, type Article } from "../services/content";
import { useSport } from "../lib/sport";

const MODES = ["Solo", "Share Link", "Timed"] as const;
type Mode = typeof MODES[number];
const MODE_LABEL_KEYS: Record<Mode, string> = {
  "Solo": "exam.modeSolo",
  "Share Link": "exam.modeShareLink",
  "Timed": "exam.modeTimed",
};

export default function ExamPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { sportId, levelId } = useSport();

  const [articles,  setArticles]  = useState<Article[]>([]);
  const [selected,  setSelected]  = useState<string[]>([]);
  const [casebook,  setCasebook]  = useState(true);
  const [count,     setCount]     = useState(25);
  const [maxCount,  setMaxCount]  = useState(25);
  const [secPerQ,   setSecPerQ]   = useState(45);
  const [mode,      setMode]      = useState<Mode>("Share Link");
  const [loading,   setLoading]   = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  // Load real articles for this sport/level once on mount.
  useEffect(() => {
    contentService.listArticles(sportId, levelId)
      .then((arts) => {
        setArticles(arts);
        setSelected(arts.slice(0, 3).map(a => a.id));
      })
      .catch(() => {});
  }, [sportId, levelId]);

  // Cap the question count to what's actually available for the current
  // article selection + casebook toggle.
  useEffect(() => {
    if (selected.length === 0) { setMaxCount(0); return; }
    questionService.sampleQuiz({
      sportId, articleIds: selected, casebook, difficulty: [], count: 500n,
    }).then((qs) => {
      setMaxCount(qs.length);
      setCount(c => Math.max(5, Math.min(c, qs.length)));
    }).catch(() => {});
  }, [selected, casebook, sportId]);

  const toggle = (id: string) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const estMinutes = Math.round((count * secPerQ) / 60);
  const difficulty = count <= 10 ? t("exam.difficultyBeginner") : count <= 25 ? t("exam.difficultyIntermediate") : t("exam.difficultyAdvanced");

  const modeMap: Record<Mode, { Solo: null } | { ShareLink: null } | { Timed: null }> = {
    "Solo":       { Solo: null },
    "Share Link": { ShareLink: null },
    "Timed":      { Timed: null },
  };

  async function generate() {
    setLoading(true);
    try {
      const qs = await questionService.sampleQuiz({
        sportId,
        articleIds: selected,
        casebook,
        difficulty: [],
        count:      BigInt(count),
      });
      const session = await examService.createSession(
        {
          sportId,
          articleIds: selected,
          casebook,
          count:      BigInt(qs.length),
          secPerQ:    BigInt(secPerQ),
          mode:       modeMap[mode],
        },
        qs.map(q => q.id),
      );
      const token = session.shareToken.length ? session.shareToken[0] : null;
      if (token) {
        setShareToken(token);
        await navigator.clipboard.writeText(`${window.location.origin}/quiz/share/${token}`).catch(() => {});
      } else {
        // Solo / Timed: hand the already-generated session + questions straight
        // to QuizPage instead of letting it sample a brand new, unrelated set.
        navigate(`/quiz/${selected[0] ?? "ncaa_basketball:art4"}`, {
          state: { sessionId: session.id, questionIds: qs.map(q => q.id), secPerQ },
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{t("exam.title")}</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {t("exam.subtitle")}
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>

        <button
          onClick={() => navigate("/exam-sim")}
          style={{
            width: "100%", padding: "16px", background: T.navy, color: T.white,
            borderRadius: 10, textAlign: "left", display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <span style={{ fontSize: 26 }}>🎓</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{t("exam.certSimTitle")}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
              {t("exam.certSimDesc")}
            </div>
          </div>
          <span style={{ fontSize: 18 }}>›</span>
        </button>

        {/* Article selector */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 10 }}>{t("exam.ruleArticles")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {articles.map((a) => {
              const on = selected.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggle(a.id)}
                  style={{
                    padding: "7px 14px", borderRadius: 6,
                    background: on ? T.navy : T.surface,
                    color: on ? T.white : T.text,
                    border: `1px solid ${on ? T.navy : T.border}`,
                    fontSize: 13, fontWeight: on ? 700 : 400,
                  }}
                >Art. {Number(a.number)}</button>
              );
            })}
          </div>
        </div>

        {/* Casebook toggle */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14 }}>{t("exam.includeCasebook")}</span>
          <button
            onClick={() => setCasebook(v => !v)}
            style={{
              width: 48, height: 26, borderRadius: 13,
              background: casebook ? T.navy : T.border,
              position: "relative", transition: "background 0.2s",
            }}
          >
            <span style={{
              position: "absolute", top: 3,
              left: casebook ? "calc(100% - 23px)" : 3,
              width: 20, height: 20, borderRadius: "50%",
              background: T.white, transition: "left 0.2s",
              display: "block",
            }} />
          </button>
        </div>

        {/* Count + time steppers */}
        {([
          { label: t("exam.questionsLabel"),          value: count,  set: setCount,  min: 5,  max: Math.max(maxCount, 5), step: 5 },
          { label: t("exam.timePerQuestionLabel"),  value: secPerQ, set: setSecPerQ, min: 15, max: 120, step: 15, suffix: t("exam.secSuffix") },
        ]).map((row) => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14 }}>{row.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => (row.set as any)((v: number) => Math.max(row.min, v - row.step))}
                style={{ width: 28, height: 28, borderRadius: 6, background: T.bg, border: `1px solid ${T.border}`, fontSize: 16 }}
              >−</button>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.red, minWidth: 40, textAlign: "center" }}>
                {row.value}{"suffix" in row ? row.suffix : ""}
              </span>
              <button
                onClick={() => (row.set as any)((v: number) => Math.min(row.max, v + row.step))}
                style={{ width: 28, height: 28, borderRadius: 6, background: T.bg, border: `1px solid ${T.border}`, fontSize: 16 }}
              >+</button>
            </div>
          </div>
        ))}
        {maxCount < count && (
          <div style={{ fontSize: 12, color: T.muted, marginTop: -12 }}>
            {t("exam.onlyAvailable", { count: maxCount })}
          </div>
        )}

        {/* Mode selector */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14 }}>{t("exam.mode")}</span>
          <select
            value={mode}
            onChange={e => setMode(e.target.value as Mode)}
            style={{ fontSize: 14, fontWeight: 700, color: T.red, background: "transparent", border: "none", cursor: "pointer" }}
          >
            {MODES.map(m => <option key={m} value={m}>{t(MODE_LABEL_KEYS[m])}</option>)}
          </select>
        </div>

        {/* Difficulty estimate */}
        <div style={{
          padding: "12px 14px", background: T.bg,
          border: `1px solid ${T.border}`, borderRadius: 8,
          display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: T.muted,
        }}>
          <span style={{ fontSize: 18 }}>📊</span>
          <span>{t("exam.estDifficulty")} <strong>{difficulty}</strong></span>
          <span style={{ marginLeft: "auto" }}>{t("exam.estMinutes", { minutes: estMinutes })}</span>
        </div>

        {/* Generate / share link result */}
        {!shareToken ? (
          <button
            onClick={generate}
            disabled={loading || selected.length === 0 || maxCount === 0}
            style={{
              width: "100%", padding: "14px 0",
              background: loading || selected.length === 0 || maxCount === 0 ? T.border : T.navy,
              color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700,
            }}
          >
            {loading ? t("exam.generating") : t("exam.generateAndCopy")}
          </button>
        ) : (
          <div style={{
            padding: 20, background: "#EEF3FC",
            border: `1px solid ${T.navy}`, borderRadius: 8, textAlign: "center",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔗</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{t("exam.ready")}</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>
              {t("exam.linkCopied")}
            </div>
            <button
              onClick={() => navigate(`/quiz/share/${shareToken}`)}
              style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 14, fontWeight: 700 }}
            >
              {t("exam.startMyAttempt")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
