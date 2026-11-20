import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useSport } from "../lib/sport";
import { groupByRule } from "../lib/clips";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "../components/LoadError";
import { contentService } from "../services/content";
import { associationService } from "../services/association";
import { clipService, type Clip } from "../services/clips";

/**
 * The film room (issue #29): game clips by rule, for everyone and for the
 * official's associations, and, for admins and association coordinators,
 * the clips waiting for their review.
 */
export default function FilmRoomPage() {
  const { t } = useTranslation();
  const { sportId, levelId } = useSport();
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const q = useCanisterQuery(async () => {
    const [articles, everyone, associations, toReview] = await Promise.all([
      contentService.listArticles(sportId, levelId),
      clipService.list(sportId),
      associationService.getMyAssociations().catch(() => []),
      clipService.toReview().catch(() => [] as Clip[]),
    ]);
    // An association's clips are optional extras: one that fails to load
    // doesn't hide the rest.
    const theirs = await Promise.all(associations.map(a => clipService.listForAssociation(a.id).catch(() => [] as Clip[])));
    const names = new Map(associations.map(a => [a.id, a.name]));
    const clips = [...everyone, ...theirs.flat()].filter(c => c.sportId === sportId);
    return { titles: new Map(articles.map(a => [a.id, { number: Number(a.number), title: a.title }])), clips, names, toReview };
  }, [sportId, levelId]);

  async function review(id: string, approve: boolean) {
    await clipService.review(id, approve);
    setReviewed(r => new Set(r).add(id));
  }

  const badge = { fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const };
  const waiting = (q.data?.toReview ?? []).filter(c => !reviewed.has(c.id));

  const row = (c: Clip, extra?: React.ReactNode) => {
    const assoc = "association" in c.visibility ? q.data!.names.get(c.visibility.association) : undefined;
    return (
      <div key={c.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
        <Link to={`/clips/${c.id}`} style={{ color: T.text, fontWeight: 600, fontSize: 15, textDecoration: "none" }}>{c.title}</Link>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {c.callAtSec.length > 0 && <span style={{ ...badge, color: fill.accent }}>{t("clips.makeTheCall")}</span>}
          {"pending" in c.status && <span style={{ ...badge, color: fill.attention }}>{t("clips.waiting")}</span>}
          {assoc && <span style={{ ...badge, color: T.muted }}>{t("clips.membersOf", { name: assoc })}</span>}
        </div>
        {extra}
      </div>
    );
  };

  return (
    <div style={{ padding: "52px 16px 32px", fontFamily: T.font, color: T.text, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, lineHeight: 1.05 }}>{t("clips.filmRoom")}</div>
        <Link to="/clips/new" style={{ minHeight: 40, padding: "0 14px", display: "inline-flex", alignItems: "center", background: fill.accent, color: fill.onAccent, borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
          {t("clips.uploadTitle")}
        </Link>
      </div>
      {q.loading && <div style={{ color: T.muted }}>{t("common.loading")}</div>}
      {q.error && <LoadError onRetry={q.reload} />}

      {q.data && waiting.length > 0 && (
        <section aria-label={t("clips.toReview")} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ ...badge, color: T.faint }}>{t("clips.toReview")}</div>
          {waiting.map(c => row(c, (
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={() => review(c.id, true)} style={{ minHeight: 36, padding: "0 12px", background: fill.accent, color: fill.onAccent, border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}>{t("clips.approve")}</button>
              <button onClick={() => review(c.id, false)} style={{ minHeight: 36, padding: "0 12px", background: "transparent", color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer" }}>{t("clips.reject")}</button>
            </div>
          )))}
        </section>
      )}

      {q.data && q.data.clips.length === 0 && <div style={{ color: T.muted, fontSize: 14 }}>{t("clips.none")}</div>}
      {q.data && groupByRule(q.data.clips).map(g => {
        const rule = q.data!.titles.get(g.articleId);
        const name = rule ? t("clips.ruleOption", { number: rule.number, title: rule.title }) : g.articleId;
        return (
          <section key={g.articleId} aria-label={name} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ ...badge, color: T.faint }}>{name}</div>
            {g.clips.map(c => row(c))}
          </section>
        );
      })}
    </div>
  );
}
