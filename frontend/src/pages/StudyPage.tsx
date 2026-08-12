import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
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

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{t("study.title")}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          {sportDisplayName}
        </div>
      </div>

      <div style={{ display: "flex", padding: "12px 16px 0", gap: 8 }}>
        {([["rules", t("study.tabRules")], ["mechanics", t("study.tabMechanics")]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: tab === key ? T.navy : T.surface,
              color: tab === key ? T.white : T.text,
              border: `1px solid ${tab === key ? T.navy : T.border}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <audio ref={audioRef} onEnded={() => setPlayingPoeId(null)} style={{ display: "none" }} />

      {tab === "mechanics" ? (
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 14 }}>
            {t("study.mechanicsDesc")}
          </div>

          {mechanicsMastery !== null && (
            <div style={{
              padding: "12px 14px", marginBottom: 14, background: T.surface,
              border: `1px solid ${T.border}`, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{t("study.mechanicsMastery")}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.navy }}>{mechanicsMastery}%</span>
            </div>
          )}

          <button
            onClick={() => navigate(`/quiz/${MECHANICS_ARTICLE_ID}`, {
              state: { articleIds: [MECHANICS_ARTICLE_ID], casebook: false },
            })}
            style={{
              width: "100%", padding: "16px", background: T.navy, color: T.white,
              borderRadius: 10, textAlign: "left", display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 26 }}>❓</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t("study.rotationQuizTitle")}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                {t("study.rotationQuizDesc")}
              </div>
            </div>
            <span style={{ fontSize: 18 }}>›</span>
          </button>

          <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 10 }}>
            {t("study.coverageZoneDrills")}
          </div>
          {scenarios.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted }}>{t("study.noDrills")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/mechanics/${s.id}`)}
                  style={{
                    padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: 10, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{t("study.crewZones", { crewSize: Number(s.crewSize), count: s.zones.length })}</div>
                  </div>
                  <span style={{ color: T.muted, fontSize: 18 }}>›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
      <>
      {assignmentRows.length > 0 && (
        <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>{t("study.assignedModules")}</div>
          {assignmentRows.map(({ assignment: a, coordinatorName, done }) => (
            <div
              key={a.id}
              onClick={() => !done && navigate(`/quiz/${a.articleIds[0] ?? "ncaa_basketball:art4"}`, {
                state: { assignmentId: a.id, articleIds: a.articleIds, casebook: a.casebook },
              })}
              style={{
                padding: "12px 14px", background: T.surface,
                border: `1px solid ${done ? T.correct : T.navy}`, borderRadius: 10,
                cursor: done ? "default" : "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: T.white,
                  background: done ? T.correct : T.navy, borderRadius: 6, padding: "2px 6px",
                }}>
                  {done ? t("study.done") : t("study.assigned")}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{a.title}</span>
              </div>
              <div style={{ fontSize: 11, color: T.muted }}>
                {t("study.assignedBy", { name: coordinatorName, date: new Date(Number(a.dueAt / 1_000_000n)).toLocaleDateString() })}
              </div>
            </div>
          ))}
        </div>
      )}

      {poes.length > 0 && (
        <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>
            {t("study.pointsOfEmphasis", { season: CURRENT_SEASON })}
          </div>
          {poes.map((poe) => {
            const reviewed = poe.linkedArticleIds.length > 0 &&
              poe.linkedArticleIds.every(id => Number(progress[id]?.timesStudied ?? 0n) > 0);
            const hasAudio = poe.audioUrl.length > 0;
            const isPlaying = playingPoeId === poe.id;
            return (
              <div
                key={poe.id}
                style={{
                  padding: "14px 16px", background: T.surface,
                  border: `1px solid ${reviewed ? T.correct : T.navy}`,
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: T.white, background: T.navy,
                    borderRadius: 6, padding: "2px 6px",
                  }}>
                    {t("study.poe")}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{poe.title}</span>
                  {reviewed && <span style={{ fontSize: 11, fontWeight: 700, color: T.correct }}>{t("study.reviewed")}</span>}
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>{poe.body}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {poe.linkedArticleIds.map((id) => {
                      const a = articles.find(x => x.id === id);
                      return (
                        <button
                          key={id}
                          onClick={() => navigate(`/quiz/${id}?adaptive=1`)}
                          style={{
                            padding: "4px 8px", background: T.bg,
                            border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11,
                          }}
                        >
                          {a ? `Art. ${Number(a.number)}` : id}
                        </button>
                      );
                    })}
                  </div>
                  {hasAudio && (
                    <button
                      onClick={() => togglePoeAudio(poe)}
                      style={{
                        width: 30, height: 30, borderRadius: "50%", background: T.navy, color: T.white,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0,
                      }}
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

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{
              height: 64, background: T.border, borderRadius: 10,
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))
        ) : ordered.map((a) => {
          const p = progress[a.id];
          const done = !!p && Number(p.timesStudied) > 0;
          const overdue = overdueIds.has(a.id);
          const due = dueCounts[a.id] ?? 0;
          const hasAudio = a.audioUrl.length > 0;
          const downloaded = downloadedIds.has(a.id);
          const downloading = downloadingId === a.id;
          return (
            <div
              key={a.id}
              onClick={() => navigate(`/quiz/${a.id}?adaptive=1`)}
              role="button"
              tabIndex={0}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px",
                background: T.surface,
                border: `1px solid ${overdue ? T.wrong : T.border}`,
                borderRadius: 10, textAlign: "left", cursor: "pointer",
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: overdue ? "#FDECEA" : done ? "#E6F4EC" : T.navy,
                color: overdue ? T.wrong : done ? T.correct : T.white,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {overdue ? "!" : done ? "✓" : Number(a.number)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  {t("study.article", { number: Number(a.number) })}
                  {overdue && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.wrong }}>{t("study.overdue")}</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{a.title}</div>
                {due > 0 && (
                  <div style={{ fontSize: 11, color: T.navy, fontWeight: 600, marginTop: 4 }}>
                    {t("study.dueToday", { count: due })}
                  </div>
                )}
                {done && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <div style={{ flex: 1, height: 3, background: T.border, borderRadius: 2, overflow: "hidden", maxWidth: 120 }}>
                      <div style={{
                        height: "100%", width: `${Math.min(100, Number(p.masteryScore))}%`,
                        background: T.correct, borderRadius: 2,
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: T.muted }}>
                      {t("study.masteryStat", { pct: Number(p.masteryScore), count: Number(p.timesStudied) })}
                    </span>
                  </div>
                )}
              </div>
              {hasAudio && (
                <button
                  onClick={(e) => handleDownloadToggle(a.id, e)}
                  title={downloaded ? t("study.removeDownload") : t("study.downloadForOffline")}
                  style={{
                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                    background: downloaded ? "#E6F4EC" : T.bg,
                    color: downloaded ? T.correct : T.muted,
                    border: `1px solid ${downloaded ? T.correct : T.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
                  }}
                >
                  {downloading ? "…" : downloaded ? "✓" : "⬇"}
                </button>
              )}
              <span style={{ color: T.muted, fontSize: 18 }}>›</span>
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
