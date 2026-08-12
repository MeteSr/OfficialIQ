import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { T } from "../tokens";
import { rankingService, type Group } from "../services/ranking";
import { useAuthStore } from "../store/authStore";
import { useSport, useSportDisplayName } from "../lib/sport";

export default function GroupsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated, profile } = useAuthStore();
  const { sportId: SPORT_ID } = useSport();
  const sportDisplayName = useSportDisplayName();

  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [publicGroups, setPublicGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [state, setState] = useState(profile?.state ?? "");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    Promise.all([
      isAuthenticated ? rankingService.getMyGroups().catch(() => []) : Promise.resolve([]),
      rankingService.listPublicGroups(SPORT_ID).catch(() => []),
    ]).then(([mine, pub]) => {
      setMyGroups(mine);
      setPublicGroups(pub);
    }).finally(() => setLoading(false));
  }

  useEffect(refresh, [isAuthenticated, SPORT_ID]);

  const myGroupIds = new Set(myGroups.map(g => g.id));
  const joinable = publicGroups.filter(g => !myGroupIds.has(g.id));

  async function handleCreate() {
    if (!name.trim() || state.trim().length !== 2) return;
    setCreating(true);
    setError(null);
    try {
      await rankingService.createGroup(name.trim(), SPORT_ID, state.trim().toUpperCase(), isPrivate);
      setName("");
      setShowForm(false);
      refresh();
    } catch (e: any) {
      setError(e.message ?? t("groups.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(id: string) {
    setJoiningId(id);
    try {
      await rankingService.joinGroup(id);
      refresh();
    } catch {
      // leave the list as-is; user can retry
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <div>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>👥 {t("groups.title")}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
          {sportDisplayName}
        </div>
      </div>

      {!isAuthenticated ? (
        <div style={{ padding: 24, textAlign: "center", color: T.muted }}>
          {t("groups.signInPrompt")}
        </div>
      ) : (
        <div style={{ padding: 16 }}>
          <button
            onClick={() => setShowForm(s => !s)}
            style={{
              width: "100%", padding: "13px 0", marginBottom: 14,
              background: T.red, color: T.white, borderRadius: 8, fontSize: 14, fontWeight: 700,
            }}
          >
            {showForm ? t("common.cancel") : t("groups.createGroup")}
          </button>

          {showForm && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
              {error && <div style={{ color: T.wrong, fontSize: 12, marginBottom: 8 }}>{error}</div>}
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t("groups.namePlaceholder")}
                style={{ width: "100%", padding: "9px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 8, background: T.bg, color: T.text }}
              />
              <input
                value={state}
                onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder={t("groups.statePlaceholder")}
                style={{ width: "100%", padding: "9px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 8, background: T.bg, color: T.text }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.muted, marginBottom: 10 }}>
                <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />
                {t("groups.privateLabel")}
              </label>
              <button
                disabled={creating || !name.trim() || state.trim().length !== 2}
                onClick={handleCreate}
                style={{ width: "100%", padding: "11px 0", background: T.navy, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
              >
                {creating ? t("groups.creating") : t("groups.createGroupButton")}
              </button>
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("groups.myGroups")}</div>
          {loading ? (
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>{t("common.loading")}</div>
          ) : myGroups.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
              {t("groups.notJoinedYet")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {myGroups.map(g => (
                <button
                  key={g.id}
                  onClick={() => navigate(`/groups/${g.id}`)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: 8, textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                      {g.state} · {t("groupDetail.memberCount", { count: Number(g.memberCount) })}{g.isPrivate ? ` · ${t("groupDetail.private")}` : ""}
                    </div>
                  </div>
                  <span style={{ color: T.muted, fontSize: 18 }}>›</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t("groups.discoverPublic")}</div>
          {loading ? null : joinable.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted }}>{t("groups.noPublicGroups")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {joinable.map(g => (
                <div
                  key={g.id}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                      {g.state} · {t("groupDetail.memberCount", { count: Number(g.memberCount) })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleJoin(g.id)}
                    disabled={joiningId === g.id}
                    style={{ padding: "7px 14px", background: T.navy, color: T.white, borderRadius: 6, fontSize: 12, fontWeight: 700 }}
                  >
                    {joiningId === g.id ? t("groups.joining") : t("groups.join")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
