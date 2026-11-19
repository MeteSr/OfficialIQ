import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { useCanisterQuery } from "../hooks/useCanisterQuery";
import LoadError from "../components/LoadError";
import GradedQuiz from "../components/GradedQuiz";
import { challengeService, type Crew } from "../services/challenge";
import { examService } from "../services/exam";
import { questionService, type Question } from "../services/question";
import { userService } from "../services/user";
import { CREW_SEC_PER_Q, crewMisses, gameTimeMs } from "../lib/gameDay";
import { crewJoinUrl } from "../lib/crew";

function formatGameTime(ns: bigint): string {
  return new Date(gameTimeMs(ns)).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Crew pregame (#64): everyone working the game plays the same short quiz,
// then the crew sees who missed what, so the pregame starts from real gaps.
export default function CrewPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { principal } = useAuthStore();
  const [playing, setPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const crewQ = useCanisterQuery(() => challengeService.getCrew(id), [id]);
  const crew = crewQ.data ?? null;
  const mine = crew?.results.find(r => r.principal.toString() === principal);

  const [names, setNames] = useState<Record<string, string>>({});
  const memberKey = crew?.members.map(m => m.toString()).join(",") ?? "";
  useEffect(() => {
    if (!crew) return;
    for (const m of crew.members) {
      const k = m.toString();
      if (names[k]) continue;
      userService.getPublicProfile(m).then(p => {
        if (p?.displayName) setNames(n => ({ ...n, [k]: p.displayName }));
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey]);
  const nameOf = (p: string) => p === principal ? t("gameDay.you") : names[p] ?? t("gameDay.crewMate");

  // Question text for the breakdown, once the caller has played (so it
  // can't spoil the quiz).
  const questionsQ = useCanisterQuery<Question[]>(async () => {
    if (!crew || !mine) return [];
    const qs = await Promise.all(crew.questionIds.map(q => questionService.getQuestion(q).catch(() => null)));
    return qs.filter((q): q is Question => q !== null);
  }, [crew?.id, !!mine]);

  const start = useCallback(() => {
    const c = crew!;
    return examService.startGradedSession({
      sportId: c.sportId, articleIds: [], casebook: false,
      count: BigInt(c.questionIds.length), secPerQ: BigInt(CREW_SEC_PER_Q), mode: { Timed: null },
    }, { Ids: c.questionIds });
  }, [crew]);

  const onFinished = useCallback(async (finish: { session: { id: string } }) => {
    await challengeService.submitCrewResult(id, finish.session.id);
    setPlaying(false);
    crewQ.reload();
  }, [id, crewQ]);

  async function share(c: Crew) {
    const url = crewJoinUrl(c.code);
    const text = t("gameDay.shareText", { game: c.gameLabel });
    if (navigator.share) {
      await navigator.share({ title: t("gameDay.crewTitle"), text, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
  }

  async function leave() {
    setActionError(null);
    try {
      await challengeService.leaveCrew(id);
      navigate("/schedule");
    } catch (e: any) {
      setActionError(e?.message ?? t("common.error"));
    }
  }

  if (crewQ.error) return <LoadError onRetry={crewQ.reload} />;
  if (crewQ.loading && !crew) return <div role="status" style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  if (!crew) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{t("gameDay.crewNotFound")}</div>
        <button onClick={() => navigate("/schedule")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          {t("gameDay.backToSchedule")}
        </button>
      </div>
    );
  }

  if (playing) {
    return <GradedQuiz start={start} secPerQ={CREW_SEC_PER_Q} label={crew.gameLabel} onBack={() => setPlaying(false)} onFinished={onFinished} />;
  }

  const { finished, misses } = crewMisses(crew);
  const questions = new Map((questionsQ.data ?? []).map(q => [q.id, q]));
  const closed = Date.now() > gameTimeMs(crew.expiresAt);

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ background: T.navy, padding: "52px 20px 16px", color: T.white }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{t("gameDay.crewTitle")}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{crew.gameLabel}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{formatGameTime(crew.gameDate)}</div>
      </div>

      <div style={{ padding: 16 }}>
        {!closed && (
          <div style={{ padding: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>{t("gameDay.inviteCrew")}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{ flex: 1, fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>{crew.code}</code>
              <button onClick={() => share(crew)} style={{ padding: "8px 14px", background: T.navy, color: T.white, borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                {copied ? t("gameDay.linkCopied") : t("gameDay.shareLink")}
              </button>
            </div>
          </div>
        )}

        {!mine && !closed && (
          <button onClick={() => setPlaying(true)} style={{ width: "100%", padding: "14px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
            {t("gameDay.takeCrewQuiz", { count: crew.questionIds.length })}
          </button>
        )}

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("gameDay.crewMembers", { count: crew.members.length })}</div>
        {crew.members.map(m => {
          const k = m.toString();
          const r = crew.results.find(x => x.principal.toString() === k);
          return (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
              <span>{nameOf(k)}</span>
              <span style={{ color: r ? T.text : T.muted, fontWeight: r ? 700 : 400 }}>
                {r ? `${Number(r.score)}%` : t("gameDay.notYet")}
              </span>
            </div>
          );
        })}

        <div style={{ fontSize: 13, fontWeight: 700, margin: "18px 0 8px" }}>{t("gameDay.crewMisses")}</div>
        {!mine ? (
          <div style={{ fontSize: 12, color: T.muted }}>{t("gameDay.finishToSee")}</div>
        ) : questionsQ.error ? (
          <LoadError onRetry={questionsQ.reload} />
        ) : (
          misses.map(({ questionId, missedBy }) => {
            const q = questions.get(questionId);
            return (
              <div key={questionId} style={{ padding: 12, background: T.surface, border: `1px solid ${missedBy.length ? T.wrong : T.border}`, borderRadius: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700 }}>{q?.citation ?? ""}</span>
                  <span style={{ color: missedBy.length ? T.wrong : T.correct, fontWeight: 700 }}>
                    {t("gameDay.missedByOf", { missed: missedBy.length, finished })}
                  </span>
                </div>
                {q && <div style={{ fontSize: 13, marginBottom: missedBy.length ? 6 : 0 }}>{q.stem}</div>}
                {missedBy.length > 0 && (
                  <div style={{ fontSize: 12, color: T.muted }}>{missedBy.map(nameOf).join(", ")}</div>
                )}
                {missedBy.length > 0 && q && (
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>{q.explanation}</div>
                )}
              </div>
            );
          })
        )}

        {actionError && <div role="alert" style={{ fontSize: 12, color: T.wrong, marginTop: 10 }}>{actionError}</div>}
        <button onClick={leave} style={{ width: "100%", marginTop: 16, padding: "10px 0", background: T.bg, color: T.muted, borderRadius: 8, fontSize: 12 }}>
          {t("gameDay.leaveCrew")}
        </button>
      </div>
    </div>
  );
}

// /crew/join/:code: preview the crew, then join it.
export function CrewJoinPage() {
  const { code = "" } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useCanisterQuery(() => challengeService.getCrewPreview(code), [code]);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const c = await challengeService.joinCrew(code);
      navigate(`/crew/${c.id}`, { replace: true });
    } catch (e: any) {
      setError(e?.message ?? t("common.error"));
    } finally {
      setJoining(false);
    }
  }

  if (preview.error) return <LoadError onRetry={preview.reload} />;
  if (preview.loading) return <div role="status" style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  const p = preview.data;
  if (!p) {
    return <div style={{ padding: 24, textAlign: "center", paddingTop: 80, fontSize: 16, fontWeight: 600 }}>{t("gameDay.crewNotFound")}</div>;
  }

  return (
    <div style={{ padding: "52px 16px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>{t("gameDay.crewTitle")}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{p.gameLabel}</div>
      <div style={{ fontSize: 13, color: T.muted, margin: "4px 0 16px" }}>{formatGameTime(p.gameDate)}</div>
      <div style={{ fontSize: 13, marginBottom: 20 }}>
        {t("gameDay.joinSummary", { members: Number(p.memberCount), questions: Number(p.questionCount) })}
      </div>
      {error && <div role="alert" style={{ fontSize: 12, color: T.wrong, marginBottom: 12 }}>{error}</div>}
      {isAuthenticated ? (
        <button onClick={join} disabled={joining} style={{ width: "100%", padding: "14px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700, opacity: joining ? 0.6 : 1 }}>
          {joining ? t("gameDay.joining") : t("gameDay.joinCrew")}
        </button>
      ) : (
        <button onClick={() => navigate("/me")} style={{ width: "100%", padding: "14px 0", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          {t("gameDay.signInToJoin")}
        </button>
      )}
    </div>
  );
}
