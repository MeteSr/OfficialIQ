import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { rankingService, type Group, type GroupChallenge, type GroupLeaderboardEntry } from "../services/ranking";
import { useAuthStore } from "../store/authStore";

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { principal } = useAuthStore();
  const { t } = useTranslation();

  const [group, setGroup] = useState<Group | null>(null);
  const [leaderboard, setLeaderboard] = useState<GroupLeaderboardEntry[]>([]);
  const [challenges, setChallenges] = useState<GroupChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChallengeForm, setShowChallengeForm] = useState(false);
  const [title, setTitle] = useState("");
  const [days, setDays] = useState(7);
  const [posting, setPosting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  function refresh() {
    if (!id) return;
    setLoading(true);
    Promise.all([
      rankingService.getGroup(id),
      rankingService.getGroupLeaderboard(id).catch(() => []),
      rankingService.getGroupChallenges(id).catch(() => []),
    ]).then(([g, lb, ch]) => {
      setGroup(g);
      setLeaderboard(lb);
      setChallenges(ch);
    }).finally(() => setLoading(false));
  }

  useEffect(refresh, [id]);

  const isOwner = !!group && !!principal && group.owner.toString() === principal;

  async function handlePostChallenge() {
    if (!id || !title.trim()) return;
    setPosting(true);
    try {
      const deadline = Date.now() + days * 86_400_000;
      await rankingService.postGroupChallenge(id, title.trim(), deadline);
      setTitle("");
      setShowChallengeForm(false);
      refresh();
    } catch {
      // form stays open so the owner can retry
    } finally {
      setPosting(false);
    }
  }

  async function handleLeave() {
    if (!id) return;
    setLeaving(true);
    try {
      await rankingService.leaveGroup(id);
      navigate("/groups");
    } catch {
      setLeaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>{t("common.loading")}</div>;
  }

  if (!group) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t("groupDetail.notFound")}</div>
        <button onClick={() => navigate("/groups")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          {t("groupDetail.backToGroups")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 16px 14px", display: "flex", alignItems: "center", gap: 12, color: T.white }}>
        <button onClick={() => navigate(-1)} style={{ color: T.white, fontSize: 22, background: "transparent" }}>‹</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{group.name}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            {group.state} · {t("groupDetail.memberCount", { count: Number(group.memberCount) })}{group.isPrivate ? ` · ${t("groupDetail.private")}` : ""}
          </div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("groupDetail.leaderboardTitle")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {leaderboard.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted }}>{t("groupDetail.noActivity")}</div>
          ) : leaderboard.map((e) => {
            const isYou = principal && e.principal.toString() === principal;
            return (
              <div
                key={e.principal.toString()}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", background: isYou ? "#EEF3FC" : T.surface,
                  border: `1px solid ${T.border}`, borderRadius: 8,
                }}
              >
                <span style={{ width: 20, fontSize: 13, color: T.muted, textAlign: "center" }}>{Number(e.rank)}</span>
                <div style={{ flex: 1, fontSize: 13, fontWeight: isYou ? 700 : 500 }}>{e.displayName}</div>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.navy }}>{Math.round(e.weeklyAccuracy * 100)}%</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{t("groupDetail.challengesTitle")}</div>
          {isOwner && (
            <button
              onClick={() => setShowChallengeForm(s => !s)}
              style={{ fontSize: 12, color: T.navy, fontWeight: 700, background: "transparent" }}
            >
              {showChallengeForm ? t("common.cancel") : t("groupDetail.postChallenge")}
            </button>
          )}
        </div>

        {showChallengeForm && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t("groupDetail.challengeTitlePlaceholder")}
              style={{ width: "100%", padding: "9px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 8, background: T.bg, color: T.text }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: T.muted }}>{t("groupDetail.deadline")}</span>
              <button onClick={() => setDays(d => Math.max(1, d - 1))} style={{ width: 28, height: 28, borderRadius: 6, background: T.bg, border: `1px solid ${T.border}` }}>−</button>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{t("groupDetail.dayCount", { count: days })}</span>
              <button onClick={() => setDays(d => Math.min(30, d + 1))} style={{ width: 28, height: 28, borderRadius: 6, background: T.bg, border: `1px solid ${T.border}` }}>+</button>
            </div>
            <button
              disabled={posting || !title.trim()}
              onClick={handlePostChallenge}
              style={{ width: "100%", padding: "11px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
            >
              {posting ? t("groupDetail.posting") : t("groupDetail.postToGroup")}
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {challenges.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted }}>{t("groupDetail.noChallenges")}</div>
          ) : [...challenges].reverse().map((c) => (
            <div key={c.id} style={{ padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 11, color: T.muted }}>
                {t("groupDetail.due", { date: new Date(Number(c.deadline / 1_000_000n)).toLocaleDateString() })}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleLeave}
          disabled={leaving}
          style={{
            width: "100%", padding: "12px 0", background: T.surface,
            border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.wrong, fontWeight: 600,
          }}
        >
          {leaving ? t("groupDetail.leaving") : t("groupDetail.leaveGroup")}
        </button>
      </div>
    </div>
  );
}
