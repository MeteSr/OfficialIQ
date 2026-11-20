import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { useSport } from "../lib/sport";
import { ruleSections } from "../lib/questionGen";
import { RIGHTS_STATEMENT, clipInput, formProblems, type ClipForm } from "../lib/clips";
import { contentService, type Article, type CasebookPlay } from "../services/content";
import { associationService } from "../services/association";
import { clipService, uploadVideo } from "../services/clips";

const LETTERS = ["A", "B", "C", "D"];

const label: CSSProperties = { fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.1em", color: T.faint, textTransform: "uppercase" };
const input: CSSProperties = { width: "100%", minHeight: 44, padding: "0 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontFamily: T.font, fontSize: 14, boxSizing: "border-box" };

function Field({ name, children }: { name: string; children: ReactNode }) {
  return <label style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={label}>{name}</span>{children}</label>;
}

/**
 * Upload a game clip (issue #29): the video goes straight to the video
 * host, then the clip is described (the rule it shows, a "you make the
 * call" question, who can watch it) and sent for review, with the
 * uploader's word that they may share it.
 */
export default function ClipUploadPage() {
  const { t } = useTranslation();
  const { sportId, levelId } = useSport();
  const [articles, setArticles] = useState<Article[]>([]);
  const [plays, setPlays] = useState<CasebookPlay[]>([]);
  const [associations, setAssociations] = useState<{ id: string; name: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<ClipForm>({
    uploadId: "", sportId, articleId: "", sectionKey: "", playId: "", title: "", description: "",
    makeTheCall: false, callAtSec: "", stem: "", choices: ["", "", "", ""], correctIndex: 0, explanation: "",
    visibility: "everyone", rightsAttested: false,
  });
  const set = (patch: Partial<ClipForm>) => setForm(f => ({ ...f, ...patch }));

  useEffect(() => {
    contentService.listArticles(sportId, levelId).then(arts => {
      const sorted = [...arts].sort((a, b) => Number(a.number) - Number(b.number));
      setArticles(sorted);
      setForm(f => ({ ...f, sportId, articleId: f.articleId || sorted[0]?.id || "" }));
    }).catch(() => setArticles([]));
    associationService.getMyAssociations().then(setAssociations).catch(() => setAssociations([]));
  }, [sportId, levelId]);

  useEffect(() => {
    if (!form.articleId) return;
    contentService.listPlays(form.articleId).then(setPlays).catch(() => setPlays([]));
  }, [form.articleId]);

  const article = articles.find(a => a.id === form.articleId);
  const sections = useMemo(() => (article ? ruleSections(article) : []), [article]);
  const problems = formProblems(form).concat(file ? [] : ["file"]);

  function pickPlay(playId: string) {
    const play = plays.find(p => p.id === playId);
    // The ruling explains the call, unless one is already written.
    set({ playId, ...(play && !form.explanation.trim() ? { explanation: play.ruling } : {}) });
  }

  const [tried, setTried] = useState(false);

  async function submit() {
    setTried(true);
    setError("");
    if (problems.length > 0 || !file) return;
    try {
      setProgress(0);
      const { uploadId, uploadUrl } = await clipService.startUpload();
      await uploadVideo(uploadUrl, file, setProgress);
      await clipService.create(clipInput({ ...form, uploadId }));
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  if (done) {
    return (
      <div style={{ padding: "64px 20px", fontFamily: T.font, color: T.text, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 26 }}>{t("clips.sent")}</div>
        <div style={{ color: T.muted, fontSize: 14 }}>{t("clips.sentDesc")}</div>
        <Link to="/clips" style={{ color: fill.accent, fontWeight: 600 }}>{t("clips.backToFilmRoom")}</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "52px 16px 32px", fontFamily: T.font, color: T.text, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, lineHeight: 1.05 }}>{t("clips.uploadTitle")}</div>
      <div style={{ color: T.muted, fontSize: 13 }}>{t("clips.uploadSubtitle")}</div>

      <Field name={t("clips.file")}>
        <input type="file" accept="video/*" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 14 }} />
      </Field>
      <Field name={t("clips.rule")}>
        <select value={form.articleId} onChange={e => set({ articleId: e.target.value, sectionKey: "", playId: "" })} style={input}>
          {articles.map(a => <option key={a.id} value={a.id}>{t("clips.ruleOption", { number: Number(a.number), title: a.title })}</option>)}
        </select>
      </Field>
      {sections.length > 1 && (
        <Field name={t("clips.section")}>
          <select value={form.sectionKey} onChange={e => set({ sectionKey: e.target.value })} style={input}>
            <option value="">{t("clips.wholeRule")}</option>
            {sections.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
      )}
      {plays.length > 0 && (
        <Field name={t("clips.play")}>
          <select value={form.playId} onChange={e => pickPlay(e.target.value)} style={input}>
            <option value="">{t("clips.noPlay")}</option>
            {plays.map(p => <option key={p.id} value={p.id}>{p.citation}</option>)}
          </select>
        </Field>
      )}
      <Field name={t("clips.titleLabel")}>
        <input value={form.title} maxLength={120} onChange={e => set({ title: e.target.value })} style={input} />
      </Field>
      <Field name={t("clips.description")}>
        <textarea value={form.description} maxLength={2000} onChange={e => set({ description: e.target.value })} style={{ ...input, minHeight: 72, padding: 10 }} />
      </Field>

      <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
        <input type="checkbox" checked={form.makeTheCall} onChange={e => set({ makeTheCall: e.target.checked })} />
        {t("clips.makeTheCallToggle")}
      </label>
      {form.makeTheCall && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 12, borderLeft: `3px solid ${T.border}` }}>
          <Field name={t("clips.stopAt")}>
            <input inputMode="numeric" value={form.callAtSec} onChange={e => set({ callAtSec: e.target.value })} style={input} />
          </Field>
          <Field name={t("clips.question")}>
            <input value={form.stem} onChange={e => set({ stem: e.target.value })} style={input} />
          </Field>
          {form.choices.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="radio" name="correct" aria-label={t("clips.isRight", { letter: LETTERS[i] })} checked={form.correctIndex === i} onChange={() => set({ correctIndex: i })} />
              <input aria-label={t("clips.choice", { letter: LETTERS[i] })} value={c} onChange={e => set({ choices: form.choices.map((x, k) => (k === i ? e.target.value : x)) })} style={input} />
            </div>
          ))}
          <Field name={t("clips.explanation")}>
            <textarea value={form.explanation} onChange={e => set({ explanation: e.target.value })} style={{ ...input, minHeight: 72, padding: 10 }} />
          </Field>
        </div>
      )}

      <Field name={t("clips.audience")}>
        <select value={form.visibility} onChange={e => set({ visibility: e.target.value })} style={input}>
          <option value="everyone">{t("clips.everyone")}</option>
          {associations.map(a => <option key={a.id} value={a.id}>{t("clips.membersOf", { name: a.name })}</option>)}
        </select>
      </Field>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.4 }}>
        <input type="checkbox" checked={form.rightsAttested} onChange={e => set({ rightsAttested: e.target.checked })} style={{ marginTop: 3 }} />
        {RIGHTS_STATEMENT}
      </label>

      {tried && problems.length > 0 && (
        <div style={{ color: fill.wrong, fontSize: 13 }}>{t("clips.needs", { fields: problems.map(p => t(`clips.field.${p}`)).join(", ") })}</div>
      )}
      {error && <div style={{ color: fill.wrong, fontSize: 13 }}>{error}</div>}
      <button
        onClick={submit}
        disabled={progress !== null}
        style={{ minHeight: 48, borderRadius: 10, border: "none", background: fill.accent, color: fill.onAccent, fontSize: 15, fontWeight: 700, cursor: progress !== null ? "default" : "pointer" }}
      >
        {progress !== null ? t("clips.uploading", { percent: Math.round(progress * 100) }) : t("clips.upload")}
      </button>
    </div>
  );
}
