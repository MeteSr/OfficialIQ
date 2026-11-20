import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { contentService, type RuleChange } from "../services/content";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "../components/LoadError";
import { useSport } from "../lib/sport";
import { currentSeason, ruleChangeTag } from "../lib/ruleChanges";

/**
 * "What changed this season" (issue #68): each rule change with its old and
 * new wording, and a graded quiz on only the questions tagged for them.
 * The wording comes from the licensed rulebook edition each change names.
 */
export default function RuleChangesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sportId } = useSport();
  const season = currentSeason(Date.now());
  const q = useCanisterQuery<RuleChange[]>(() => contentService.listRuleChanges(sportId, season), [sportId, season]);

  function startQuiz(changes: RuleChange[]) {
    const articleIds = [...new Set(changes.map(c => c.articleId))];
    navigate(`/quiz/${articleIds[0]}`, { state: { articleIds, casebook: false, tag: ruleChangeTag(season) } });
  }

  const label = { fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint, marginBottom: 4 } as const;

  return (
    <div style={{ padding: "52px 16px 32px", fontFamily: T.font, color: T.text }}>
      <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, lineHeight: 1.05 }}>{t("ruleChanges.title")}</div>
      {q.loading && <div style={{ color: T.muted, paddingTop: 24 }}>{t("common.loading")}</div>}
      {q.error && <LoadError onRetry={q.reload} />}
      {q.data && q.data.length === 0 && (
        <div style={{ color: T.muted, paddingTop: 16 }}>{t("ruleChanges.none", { season })}</div>
      )}
      {q.data && q.data.length > 0 && (
        <>
          <div style={{ color: T.muted, fontSize: 14, margin: "6px 0 16px" }}>{t("ruleChanges.subtitle", { count: q.data.length, season })}</div>
          <button
            onClick={() => startQuiz(q.data!)}
            style={{ width: "100%", minHeight: 48, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 10, fontFamily: T.font, fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 16 }}
          >
            {t("ruleChanges.quiz")}
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {q.data.map(c => (
              <article key={c.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: T.muted }}>{c.citation}</div>
                <div style={{ fontWeight: 700, fontSize: 16, margin: "2px 0 8px" }}>{c.title}</div>
                {c.summary && <div style={{ fontSize: 14, marginBottom: 12 }}>{c.summary}</div>}
                {c.oldText ? (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <div style={label}>{t("ruleChanges.old")}</div>
                      <del style={{ display: "block", fontSize: 14, color: T.muted, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{c.oldText}</del>
                    </div>
                    <div>
                      <div style={label}>{t("ruleChanges.new")}</div>
                      <ins style={{ display: "block", textDecoration: "none", fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", borderLeft: `3px solid ${fill.accent}`, paddingLeft: 10 }}>{c.newText}</ins>
                    </div>
                  </>
                ) : (
                  // No old wording to compare (an imported change is the
                  // rulebook's own description of it): the text alone.
                  <div style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap", borderLeft: `3px solid ${fill.accent}`, paddingLeft: 10 }}>{c.newText}</div>
                )}
                {c.source && <div style={{ fontSize: 11, color: T.faint, marginTop: 10 }}>{t("ruleChanges.source", { source: c.source })}</div>}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
