import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
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

  useEffect(() => {
    contentService.listArticles(sportId, levelId)
      .then((arts) => {
        setArticles(arts);
        setSelected(arts.slice(0, 3).map(a => a.id));
      })
      .catch(() => {});
  }, [sportId, levelId]);

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
        sportId, articleIds: selected, casebook, difficulty: [], count: BigInt(count),
      });
      const session = await examService.createSession(
        { sportId, articleIds: selected, casebook, count: BigInt(qs.length), secPerQ: BigInt(secPerQ), mode: modeMap[mode] },
        qs.map(q => q.id),
      );
      const token = session.shareToken.length ? session.shareToken[0] : null;
      if (token) {
        setShareToken(token);
        await navigator.clipboard.writeText(`${window.location.origin}/quiz/share/${token}`).catch(() => {});
      } else {
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

  const canGenerate = !loading && selected.length > 0 && maxCount > 0;

  return (
    <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font, display: "flex", flexDirection: "column", paddingBottom: 64 }}>
      {/* Header */}
      <div style={{ background: T.panelAlt, padding: "56px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text, lineHeight: 1.05 }}>
          {t("exam.title")}
        </div>
        <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, color: T.muted, marginTop: 5 }}>
          {t("exam.subtitle")}
        </div>
      </div>

      <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Cert sim button */}
        <button
          onClick={() => navigate("/exam-sim")}
          style={{
            width: "100%", padding: 16, background: fill.accent, color: fill.onAccent,
            border: 0, borderRadius: 10, textAlign: "left", display: "flex", alignItems: "center",
            gap: 12, minHeight: 64, cursor: "pointer",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>{t("exam.certSimTitle")}</div>
            <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 12, color: `${fill.onAccent}a6`, marginTop: 3 }}>
              {t("exam.certSimDesc")}
            </div>
          </div>
          <span style={{ fontSize: 19, color: fill.onAccent }}>›</span>
        </button>

        {/* Article selector */}
        <div>
          <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint, marginBottom: 11 }}>
            {t("exam.ruleArticles")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {articles.map((a) => {
              const on = selected.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggle(a.id)}
                  style={{
                    minHeight: 40, padding: "0 14px", borderRadius: 6,
                    background: on ? fill.accent : T.surface,
                    color: on ? fill.onAccent : T.text,
                    border: `1px solid ${on ? fill.accent : T.border}`,
                    fontFamily: T.font, fontWeight: on ? 600 : 400, fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Art. {Number(a.number)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Casebook toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontFamily: T.font, fontWeight: 400, fontSize: 14, color: T.text }}>{t("exam.includeCasebook")}</span>
          <button
            onClick={() => setCasebook(v => !v)}
            style={{
              width: 52, height: 30, flexShrink: 0, borderRadius: 15,
              border: `1px solid ${casebook ? fill.accent : T.border}`,
              background: casebook ? fill.accent : T.surface,
              position: "relative", padding: 0, cursor: "pointer",
            }}
          >
            <span style={{
              position: "absolute", top: 3,
              left: casebook ? 27 : 3,
              width: 22, height: 22, borderRadius: 11,
              background: casebook ? fill.onAccent : "rgba(243,244,241,0.55)",
              display: "block",
              transition: "left 0.15s",
            }} />
          </button>
        </div>

        {/* Steppers */}
        {([
          { label: t("exam.questionsLabel"), value: count, dec: () => setCount(c => Math.max(5, c - 5)), inc: () => setCount(c => Math.min(Math.max(maxCount, 5), c + 5)), display: String(count) },
          { label: t("exam.timePerQuestionLabel"), value: secPerQ, dec: () => setSecPerQ(s => Math.max(15, s - 15)), inc: () => setSecPerQ(s => Math.min(120, s + 15)), display: `${secPerQ}s` },
        ]).map((row) => (
          <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontFamily: T.font, fontWeight: 400, fontSize: 14, color: T.text }}>{row.label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={row.dec}
                style={{ width: 44, height: 44, borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.font, fontSize: 19, cursor: "pointer" }}
              >−</button>
              <span style={{ minWidth: 52, textAlign: "center", fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 21, color: fill.accent }}>
                {row.display}
              </span>
              <button
                onClick={row.inc}
                style={{ width: 44, height: 44, borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontFamily: T.font, fontSize: 19, cursor: "pointer" }}
              >+</button>
            </div>
          </div>
        ))}
        {maxCount < count && (
          <div style={{ fontFamily: T.font, fontSize: 12, color: T.muted, marginTop: -12 }}>
            {t("exam.onlyAvailable", { count: maxCount })}
          </div>
        )}

        {/* Mode selector */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontFamily: T.font, fontWeight: 400, fontSize: 14, color: T.text }}>{t("exam.mode")}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {MODES.map(m => {
              const on = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    minHeight: 40, padding: "0 12px", borderRadius: 6,
                    background: on ? fill.accent : T.surface,
                    color: on ? fill.onAccent : T.text,
                    border: `1px solid ${on ? fill.accent : T.border}`,
                    fontFamily: T.font, fontWeight: 600, fontSize: 12, cursor: "pointer",
                  }}
                >
                  {t(MODE_LABEL_KEYS[m])}
                </button>
              );
            })}
          </div>
        </div>

        {/* Difficulty estimate */}
        <div style={{
          padding: "13px 16px", background: T.surface,
          border: `1px solid ${T.border}`, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <span style={{ fontFamily: T.font, fontSize: 13, color: T.muted }}>
            {t("exam.estDifficulty")} <strong style={{ color: T.text, fontWeight: 600 }}>{difficulty}</strong>
          </span>
          <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 11, color: T.faint }}>
            ≈ {estMinutes} MIN
          </span>
        </div>

        {/* Generate / share result */}
        {!shareToken ? (
          <button
            onClick={generate}
            disabled={!canGenerate}
            style={{
              width: "100%", minHeight: 50, background: canGenerate ? fill.accent : T.border,
              color: fill.onAccent, border: 0, borderRadius: 8,
              fontFamily: T.font, fontSize: 15, fontWeight: 600,
              cursor: canGenerate ? "pointer" : "default",
            }}
          >
            {loading ? t("exam.generating") : t("exam.generateAndCopy")}
          </button>
        ) : (
          <div style={{
            padding: 20, background: T.surface,
            border: `1px solid ${fill.accent}`, borderRadius: 8, textAlign: "center",
          }}>
            <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 20, color: fill.accent, marginBottom: 4 }}>
              {t("exam.ready")}
            </div>
            <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted, marginBottom: 14 }}>
              {t("exam.linkCopied")}
            </div>
            <button
              onClick={() => navigate(`/quiz/share/${shareToken}`)}
              style={{ padding: "12px 24px", background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontFamily: T.font, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              {t("exam.startMyAttempt")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
