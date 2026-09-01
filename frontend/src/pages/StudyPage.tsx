import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T, fill } from "../tokens";
import { contentService, type Article, type PointOfEmphasis, type MechanicsScenario } from "../services/content";
import { userService, type ArticleProgress } from "../services/user";
import { questionService } from "../services/question";
import { useAuthStore } from "../store/authStore";
import { saveAudioBlob, deleteAudioBlob, getDownloadedAudioIds } from "../lib/offlineDb";
import { associationService, type Assignment } from "../services/association";
import { useSport, useSportDisplayName } from "../lib/sport";

type AssignmentRow = { assignment: Assignment; associationName: string; coordinatorName: string; done: boolean };

const CURRENT_SEASON = "2025-26";

export default function StudyPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const { sportId, levelId } = useSport();
  const sportDisplayName = useSportDisplayName();
  const MECHANICS_ARTICLE_ID = `${sportId}:mechanics`;
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [progress, setProgress] = useState<Record<string, ArticleProgress>>({});
  const [overdueIds, setOverdueIds] = useState<Set<string>>(new Set());
  const [dueCounts, setDueCounts] = useState<Record<string, number>>({});
  const [poes, setPoes] = useState<PointOfEmphasis[]>([]);
  const [playingPoeId, setPlayingPoeId] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRow[]>([]);
  const [tab, setTab] = useState<"rules" | "mechanics">("rules");
  const [scenarios, setScenarios] = useState<MechanicsScenario[]>([]);
  const [mechanicsMastery, setMechanicsMastery] = useState<number | null>(null);

  useEffect(() => {
    contentService.listPointsOfEmphasis(CURRENT_SEASON).then(setPoes).catch(() => {});
    getDownloadedAudioIds().then(ids => setDownloadedIds(new Set(ids))).catch(() => {});
    contentService.listMechanicsScenarios().then(setScenarios).catch(() => {});
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) { setMechanicsMastery(null); return; }
    userService.getMyProgress().then((p) => {
      const m = p.find(x => x.articleId === MECHANICS_ARTICLE_ID);
      setMechanicsMastery(m && Number(m.timesStudied) > 0 ? Number(m.masteryScore) : null);
    }).catch(() => {});
  }, [isAuthenticated, tab, sportId]);

  useEffect(() => {
    if (!isAuthenticated) { setAssignmentRows([]); return; }
    Promise.all([associationService.getMyAssignments(), associationService.getMyCompletions()])
      .then(async ([assigns, completions]) => {
        const doneIds = new Set(completions.map(c => c.assignmentId));
        const uniqueAssocIds = [...new Set(assigns.map(a => a.associationId))];
        const assocs = await Promise.all(uniqueAssocIds.map(id => associationService.getAssociation(id)));
        const assocById = Object.fromEntries(uniqueAssocIds.map((id, i) => [id, assocs[i]]));
        const coordinators = await Promise.all(uniqueAssocIds.map((id) => {
          const rec = assocById[id];
          return rec ? userService.getProfile(rec.coordinator).catch(() => null) : Promise.resolve(null);
        }));
        const coordNameById = Object.fromEntries(uniqueAssocIds.map((id, i) => [id, coordinators[i]?.displayName ?? t("study.yourCoordinator")]));
        const rows: AssignmentRow[] = assigns
          .map(a => ({
            assignment: a,
            associationName: assocById[a.associationId]?.name ?? "",
            coordinatorName: coordNameById[a.associationId] ?? t("study.yourCoordinator"),
            done: doneIds.has(a.id),
          }))
          .sort((a, b) => Number(a.assignment.dueAt - b.assignment.dueAt));
        setAssignmentRows(rows);
      })
      .catch(() => setAssignmentRows([]));
  }, [isAuthenticated]);

  async function handleDownloadToggle(articleId: string, e: MouseEvent) {
    e.stopPropagation();
    if (downloadedIds.has(articleId)) {
      await deleteAudioBlob(articleId);
      setDownloadedIds(s => { const next = new Set(s); next.delete(articleId); return next; });
      return;
    }
    setDownloadingId(articleId);
    try {
      const bytes = await contentService.getArticleAudio(articleId);
      if (bytes) {
        await saveAudioBlob(articleId, bytes);
        setDownloadedIds(s => new Set(s).add(articleId));
      }
    } finally {
      setDownloadingId(null);
    }
  }

  async function togglePoeAudio(poe: PointOfEmphasis) {
    if (playingPoeId === poe.id) {
      audioRef.current?.pause();
      setPlayingPoeId(null);
      return;
    }
    setLoadingAudio(poe.id);
    try {
      const bytes = await contentService.getArticleAudio(poe.id);
      if (!bytes) return;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }));
      objectUrlRef.current = url;
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
        setPlayingPoeId(poe.id);
      }
    } finally {
      setLoadingAudio(null);
    }
  }

  useEffect(() => {
    setLoading(true);
    contentService.listArticles(sportId, levelId)
      .then(async (arts) => {
        const sorted = [...arts].sort((a, b) => Number(a.number) - Number(b.number));
        setArticles(sorted);

        if (!isAuthenticated) return;
        const [myProgress, pace] = await Promise.all([
          userService.getMyProgress().catch(() => []),
          userService.getMyStudyPace().catch(() => null),
        ]);
        setProgress(Object.fromEntries(myProgress.map(p => [p.articleId, p])));
        if (pace) {
          const schedule = await userService.getWeeklySchedule(sorted.map(a => a.id)).catch(() => null);
          if (schedule) setOverdueIds(new Set(schedule.overdue));
        }

        const counts = await Promise.all(sorted.map(async (a) => {
          const [rules, casebook] = await Promise.all([
            questionService.getDueCount(sportId, [a.id], false),
            questionService.getDueCount(sportId, [a.id], true),
          ]);
          return [a.id, rules + casebook] as const;
        }));
        setDueCounts(Object.fromEntries(counts));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, sportId, levelId]);

  // Overdue articles surface at the top; everything else stays in article order.
  const ordered = [...articles].sort((a, b) => {
    const aOverdue = overdueIds.has(a.id) ? 0 : 1;
    const bOverdue = overdueIds.has(b.id) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    return Number(a.number) - Number(b.number);
  });

  const masteryColor = (pct: number) => pct >= 80 ? fill.accent : pct >= 60 ? fill.attention : fill.wrong;

  return (
    <div style={{ background: T.bg, minHeight: "100dvh", fontFamily: T.font, paddingBottom: 64 }}>
      {/* Header */}
      <div style={{ padding: "52px 20px 18px", background: T.panelAlt, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 28, color: T.text, lineHeight: 1.05 }}>
          {t("study.title")}
        </div>
        <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10, letterSpacing: "0.09em", color: T.faint, marginTop: 7 }}>
          {sportDisplayName.toUpperCase()} · VARSITY
        </div>
      </div>

      {/* Tab toggle */}
      <div style={{ display: "flex", gap: 8, padding: "14px 16px 0" }}>
        {([["rules", t("study.tabRules")], ["mechanics", t("study.tabMechanics")]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, minHeight: 44, borderRadius: 8,
              background: tab === key ? fill.accent : T.surface,
              color: tab === key ? fill.onAccent : T.text,
              border: `1px solid ${tab === key ? fill.accent : T.border}`,
              fontFamily: T.font, fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <audio ref={audioRef} onEnded={() => setPlayingPoeId(null)} style={{ display: "none" }} />

      {tab === "mechanics" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: "18px 16px" }}>
          <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 13, lineHeight: 1.6, color: T.muted }}>
            {t("study.mechanicsDesc")}
          </div>

          {mechanicsMastery !== null && (
            <div style={{ padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: T.font, fontWeight: 600, fontSize: 13, color: T.text }}>{t("study.mechanicsMastery")}</span>
              <span style={{ fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 22, color: mechanicsMastery >= 80 ? fill.accent : mechanicsMastery >= 60 ? fill.attention : fill.wrong }}>
                {mechanicsMastery}%
              </span>
            </div>
          )}

          <button
            onClick={() => navigate(`/quiz/${MECHANICS_ARTICLE_ID}`, { state: { articleIds: [MECHANICS_ARTICLE_ID], casebook: false } })}
            style={{ width: "100%", padding: 16, background: fill.accent, color: fill.onAccent, border: 0, borderRadius: 10, textAlign: "left", display: "flex", alignItems: "center", gap: 12, minHeight: 64, cursor: "pointer" }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>{t("study.rotationQuizTitle")}</div>
              <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 12, lineHeight: 1.35, color: "rgba(13,16,18,0.65)", marginTop: 3 }}>{t("study.rotationQuizDesc")}</div>
            </div>
            <span style={{ fontSize: 19 }}>›</span>
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>{t("study.coverageZoneDrills")}</div>
            {scenarios.length === 0 ? (
              <div style={{ fontFamily: T.font, fontSize: 13, color: T.muted }}>{t("study.noDrills")}</div>
            ) : scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/mechanics/${s.id}`)}
                style={{ padding: "14px 16px", minHeight: 56, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}
              >
                <div>
                  <div style={{ fontFamily: T.font, fontWeight: 600, fontSize: 13.5, color: T.text, lineHeight: 1.25 }}>{s.title}</div>
                  <div style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 10.5, color: T.faint, marginTop: 6 }}>{t("study.crewZones", { crewSize: Number(s.crewSize), count: s.zones.length })}</div>
                </div>
                <span style={{ color: T.faint, fontSize: 18 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18, padding: "18px 16px" }}>

          {/* Assigned modules */}
          {assignmentRows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>{t("study.assignedModules")}</div>
              {assignmentRows.map(({ assignment: a, coordinatorName, done }) => (
                <div
                  key={a.id}
                  onClick={() => !done && navigate(`/quiz/${a.articleIds[0] ?? "ncaa_basketball:art4"}`, { state: { assignmentId: a.id, articleIds: a.articleIds, casebook: a.casebook } })}
                  style={{ padding: "13px 16px", background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${done ? T.border : fill.accent}`, borderRadius: 10, cursor: done ? "default" : "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.1em", color: done ? T.faint : fill.accent }}>{done ? t("study.done") : t("study.assigned")}</span>
                    <span style={{ fontFamily: T.font, fontWeight: 600, fontSize: 14, color: T.text, flex: 1, lineHeight: 1.25 }}>{a.title}</span>
                  </div>
                  <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 12, color: T.muted, marginTop: 5 }}>
                    {t("study.assignedBy", { name: coordinatorName, date: new Date(Number(a.dueAt / 1_000_000n)).toLocaleDateString() })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* POE */}
          {poes.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
                {t("study.pointsOfEmphasis", { season: CURRENT_SEASON })}
              </div>
              {poes.map((poe) => {
                const reviewed = poe.linkedArticleIds.length > 0 &&
                  poe.linkedArticleIds.every(id => Number(progress[id]?.timesStudied ?? 0n) > 0);
                const hasAudio = poe.audioUrl.length > 0;
                const isPlaying = playingPoeId === poe.id;
                return (
                  <div key={poe.id} style={{ padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${fill.attention}`, borderRadius: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.1em", color: fill.attention }}>POE</span>
                      <span style={{ fontFamily: T.font, fontWeight: 600, fontSize: 14, color: T.text, flex: 1, lineHeight: 1.25 }}>{poe.title}</span>
                      {reviewed && <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10, color: fill.accent }}>REVIEWED</span>}
                    </div>
                    <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 12.5, lineHeight: 1.55, color: T.muted, marginTop: 8 }}>{poe.body}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {poe.linkedArticleIds.map((id) => {
                          const a = articles.find(x => x.id === id);
                          return (
                            <button key={id} onClick={() => navigate(`/quiz/${id}?adaptive=1`)} style={{ padding: "0 11px", minHeight: 34, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, fontFamily: T.font, fontWeight: 500, fontSize: 11.5, color: T.text, cursor: "pointer" }}>
                              {a ? `Art. ${Number(a.number)}` : id}
                            </button>
                          );
                        })}
                      </div>
                      {hasAudio && (
                        <button
                          onClick={() => togglePoeAudio(poe)}
                          style={{ width: 44, height: 44, borderRadius: 22, background: fill.accent, color: fill.onAccent, border: 0, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
                        >
                          {loadingAudio === poe.id ? "…" : isPlaying ? "❚❚" : "▶"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Articles list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ height: 64, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, opacity: 0.5 }} />
              ))
            ) : ordered.map((a) => {
              const p = progress[a.id];
              const done = !!p && Number(p.timesStudied) > 0;
              const overdue = overdueIds.has(a.id);
              const due = dueCounts[a.id] ?? 0;
              const hasAudio = a.audioUrl.length > 0;
              const downloaded = downloadedIds.has(a.id);
              const downloading = downloadingId === a.id;
              const markColor = overdue ? fill.wrong : done ? fill.accent : T.faint;
              const markBorder = overdue ? fill.wrong : done ? "rgba(120,200,150,0.45)" : T.border;
              const mPct = done ? Number(p.masteryScore) : 0;
              return (
                <div
                  key={a.id}
                  onClick={() => navigate(`/quiz/${a.id}?adaptive=1`)}
                  role="button"
                  tabIndex={0}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: T.surface, border: `1px solid ${overdue ? fill.wrong : T.border}`, borderRadius: 10, textAlign: "left", cursor: "pointer" }}
                >
                  {/* Article number / state indicator */}
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: T.bg, border: `1px solid ${markBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fontCondensed, fontWeight: 700, fontSize: 15, color: markColor, flexShrink: 0 }}>
                    {overdue ? "!" : done ? "✓" : Number(a.number)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontFamily: T.font, fontWeight: 600, fontSize: 14, color: T.text, lineHeight: 1.25 }}>{t("study.article", { number: Number(a.number) })}</span>
                      {overdue && <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 9.5, letterSpacing: "0.08em", color: fill.wrong }}>OVERDUE</span>}
                    </div>
                    <div style={{ fontFamily: T.font, fontWeight: 400, fontSize: 12, color: T.muted, marginTop: 3 }}>{a.title}</div>
                    {due > 0 && (
                      <div style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 10.5, color: fill.accent, marginTop: 6 }}>{due} DUE TODAY</div>
                    )}
                    {done && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <div style={{ flex: 1, maxWidth: 120, height: 3, borderRadius: 2, background: T.border, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${mPct}%`, background: masteryColor(mPct), borderRadius: 2 }} />
                        </div>
                        <span style={{ fontFamily: T.fontMono, fontWeight: 500, fontSize: 9.5, color: T.faint }}>{mPct}% · {Number(p.timesStudied)} SESSIONS</span>
                      </div>
                    )}
                  </div>
                  {hasAudio && (
                    <button
                      onClick={(e) => handleDownloadToggle(a.id, e)}
                      title={downloaded ? t("study.removeDownload") : t("study.downloadForOffline")}
                      style={{ width: 44, height: 44, borderRadius: 22, background: "transparent", border: `1px solid ${downloaded ? "rgba(120,200,150,0.45)" : T.border}`, color: downloaded ? fill.accent : T.faint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, cursor: "pointer" }}
                    >
                      {downloading ? "…" : downloaded ? "✓" : "⬇"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
