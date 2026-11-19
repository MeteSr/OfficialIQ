import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "../components/LoadError";
import UpgradeSheet from "../components/UpgradeSheet";
import { CallLogFailed, userService, type CallLogEntry } from "../services/user";
import { contentService } from "../services/content";
import { aiProxyService } from "../services/aiProxy";
import { features } from "../lib/features";
import { buildCandidates, candidatesText, matchFor, parseSuggestion, type Candidate } from "../lib/callLog";
import { gameTimeMs } from "../lib/gameDay";

/**
 * Post-game call log (issue #66): calls the official wasn't sure about in a
 * game, each matched to a rule (suggested by the rule assistant, accepted or
 * changed by the official) and queued for review. Private to the official.
 */
export default function CallLogPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallLogEntry[] | null>(null);

  const q = useCanisterQuery(async () => {
    const [games, logs] = await Promise.all([userService.getMyRecentGames(), userService.getMyCallLogs()]);
    const game = games.find(g => g.id === gameId) ?? null;
    if (!game) return { game: null, candidates: [] as Candidate[], logs: [] as CallLogEntry[] };
    const articles = await contentService.listArticles(game.sportId, game.levelId);
    const plays = await contentService.listPlaysFor(articles.map(a => a.id)).catch(() => []);
    return { game, candidates: buildCandidates(articles, plays), logs: logs.filter(c => c.gameId === gameId) };
  }, [gameId]);

  if (q.loading) return <div role="status" style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  if (q.error || !q.data) return <LoadError onRetry={q.reload} />;
  const { game, candidates } = q.data;
  if (!game) return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("callLog.gameNotFound")}</div>;
  const shown = calls ?? q.data.logs;
  const replace = (c: CallLogEntry) => setCalls(shown.map(x => (x.id === c.id ? c : x)));

  async function add() {
    setAdding(true);
    setAddError(null);
    try {
      const c = await userService.addCallLog(game!.id, note.trim());
      setCalls([...shown, c]);
      setNote("");
    } catch (e) {
      const reason = e instanceof CallLogFailed ? Object.keys(e.reason)[0] : "";
      setAddError(t(reason === "tooMany" ? "callLog.errTooMany" : reason === "gameTooOld" ? "callLog.errTooOld" : reason === "noteTooLong" ? "callLog.errTooLong" : "callLog.errAdd"));
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    await userService.deleteCallLog(id).catch(() => {});
    setCalls(shown.filter(c => c.id !== id));
  }

  return (
    <div style={{ padding: "52px 16px 32px", fontFamily: T.font, color: T.text, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, lineHeight: 1.05 }}>{t("callLog.title")}</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>{game.opponent}</div>
        <div style={{ fontSize: 12, color: T.muted }}>{new Date(gameTimeMs(game.gameDate)).toLocaleString()}</div>
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14 }}>
        <label htmlFor="call-note" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("callLog.noteLabel")}</label>
        <textarea
          id="call-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000}
          placeholder={t("callLog.notePlaceholder")}
          style={{ width: "100%", boxSizing: "border-box", padding: 10, border: `1px solid ${T.border}`, borderRadius: 8, background: T.bg, color: T.text, fontFamily: T.font, fontSize: 14 }}
        />
        {addError && <div role="alert" style={{ color: T.wrong, fontSize: 13, marginTop: 6 }}>{addError}</div>}
        <button
          onClick={add} disabled={adding || !note.trim()}
          style={{ marginTop: 8, width: "100%", minHeight: 44, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 8, fontWeight: 700, cursor: "pointer", opacity: adding || !note.trim() ? 0.5 : 1 }}
        >
          {t("callLog.add")}
        </button>
        <div style={{ fontSize: 11, color: T.faint, marginTop: 8 }}>{t("callLog.private")}</div>
      </div>

      {shown.map(c => <CallCard key={c.id} call={c} candidates={candidates} onChange={replace} onDelete={() => remove(c.id)} />)}
    </div>
  );
}

function CallCard({ call, candidates, onChange, onDelete }: {
  call: CallLogEntry; candidates: Candidate[]; onChange: (c: CallLogEntry) => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<{ candidate: Candidate; reason: string } | null>(null);
  const [suggestFailed, setSuggestFailed] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState("");
  const [saving, setSaving] = useState(false);
  const [upsell, setUpsell] = useState(false);
  const match = call.match[0];
  const queued = "queued" in call.status;
  const reviewed = "reviewed" in call.status;

  async function suggest() {
    setSuggesting(true);
    setSuggestFailed(false);
    try {
      const s = parseSuggestion(await aiProxyService.suggestRuleForCall(call.note, candidatesText(candidates)), candidates);
      setSuggestion(s);
      if (!s) setSuggestFailed(true);
      setChosen(s?.candidate.id ?? "");
    } catch {
      setSuggestFailed(true);
      // At the free cap: offer Pro (#71).
      aiProxyService.getRateLimitStatus().then(r => { if (r.free && r.used >= r.limitPerDay) setUpsell(true); }).catch(() => {});
    } finally {
      setSuggesting(false);
      setChoosing(true);
    }
  }

  async function save(c: Candidate) {
    setSaving(true);
    try {
      onChange(await userService.setCallMatch(call.id, matchFor(c)));
      setChoosing(false);
      setSuggestion(null);
    } finally {
      setSaving(false);
    }
  }

  const button = { minHeight: 40, padding: "0 14px", borderRadius: 8, fontFamily: T.font, fontWeight: 600, fontSize: 13, cursor: "pointer" } as const;

  return (
    <article style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{call.note}</div>

      {match && !choosing && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>{match.citation}</span>
          <span style={{ color: T.muted }}> · {queued ? t("callLog.inQueue") : reviewed ? t("callLog.reviewed") : ""}</span>
        </div>
      )}

      {suggestion && choosing && (
        <section aria-label={t("callLog.suggested")} style={{ marginTop: 10, padding: 10, background: T.bg, borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: T.faint, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t("callLog.suggested")}</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{suggestion.candidate.citation} · {suggestion.candidate.title}</div>
          {suggestion.reason && <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{suggestion.reason}</div>}
          <button onClick={() => save(suggestion.candidate)} disabled={saving} style={{ ...button, marginTop: 8, background: fill.accent, color: fill.onAccent, border: 0 }}>
            {t("callLog.accept")}
          </button>
        </section>
      )}
      {suggestFailed && choosing && <div style={{ fontSize: 13, color: T.muted, marginTop: 10 }}>{t("callLog.suggestFailed")}</div>}

      {choosing && (
        <div style={{ marginTop: 10 }}>
          <label htmlFor={`rule-${call.id}`} style={{ display: "block", fontSize: 12, color: T.muted, marginBottom: 4 }}>{t("callLog.chooseRule")}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              id={`rule-${call.id}`} value={chosen} onChange={e => setChosen(e.target.value)}
              style={{ flex: 1, minHeight: 40, border: `1px solid ${T.border}`, borderRadius: 8, background: T.bg, color: T.text, fontFamily: T.font }}
            >
              <option value="">{t("callLog.pickOne")}</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.citation} · {c.title}</option>)}
            </select>
            <button
              onClick={() => { const c = candidates.find(x => x.id === chosen); if (c) save(c); }}
              disabled={saving || !chosen}
              style={{ ...button, background: T.panelAlt, color: T.text, border: `1px solid ${T.border}` }}
            >
              {t("callLog.useRule")}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {!choosing && !reviewed && (
          features.ai ? (
            <button onClick={suggest} disabled={suggesting} style={{ ...button, background: T.panelAlt, color: T.text, border: `1px solid ${T.border}` }}>
              {suggesting ? t("callLog.suggesting") : match ? t("callLog.changeRule") : t("callLog.suggest")}
            </button>
          ) : (
            <button onClick={() => setChoosing(true)} style={{ ...button, background: T.panelAlt, color: T.text, border: `1px solid ${T.border}` }}>
              {match ? t("callLog.changeRule") : t("callLog.pickRule")}
            </button>
          )
        )}
        <button onClick={onDelete} style={{ ...button, background: "transparent", color: T.muted, border: 0, marginLeft: "auto" }}>{t("callLog.delete")}</button>
      </div>
      <UpgradeSheet open={upsell} reason="ai" onClose={() => setUpsell(false)} />
    </article>
  );
}
