import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { associationService, type AssociationRec } from "../services/association";
import { userService } from "../services/user";

const SPORT_ID = "ncaa_basketball";

export default function AssociationPage() {
  const navigate = useNavigate();
  const { isAuthenticated, profile, setProfile } = useAuthStore();

  const [mine,        setMine]        = useState<AssociationRec[]>([]);
  const [coordinated, setCoordinated] = useState<AssociationRec[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [name,       setName]       = useState("");
  const [creating,   setCreating]   = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [joinCode,   setJoinCode]   = useState("");
  const [joining,    setJoining]    = useState(false);
  const [joinError,  setJoinError]  = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    Promise.all([
      associationService.getMyAssociations(),
      associationService.getMyCoordinatedAssociations(),
    ]).then(([m, c]) => { setMine(m); setCoordinated(c); }).finally(() => setLoading(false));
  }

  useEffect(() => {
    if (isAuthenticated) refresh();
    else setLoading(false);
  }, [isAuthenticated]);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const rec = await associationService.createAssociation(name.trim(), SPORT_ID);
      if (profile && !("Coordinator" in profile.role)) {
        const updated = await userService.becomeCoordinator().catch(() => null);
        if (updated) setProfile(updated);
      }
      setName("");
      navigate(`/association/${rec.id}`);
    } catch (e: any) {
      setCreateError(e.message ?? "Couldn't create association");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      const rec = await associationService.joinAssociation(joinCode.trim());
      setJoinCode("");
      navigate(`/association/${rec.id}`);
    } catch (e: any) {
      setJoinError(e.message ?? "Invalid join code");
    } finally {
      setJoining(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Sign in to view associations.</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          Go to Sign In
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🏛️</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Associations</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          Coordinator dashboards, assigned modules, and private groups
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: T.muted }}>Loading…</div>
      ) : (
        <div style={{ padding: 16 }}>
          {coordinated.length > 0 && (
            <>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Coordinating</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {coordinated.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/association/${a.id}`)}
                    style={{
                      padding: "12px 14px", background: T.surface, border: `1px solid ${T.navy}`,
                      borderRadius: 8, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Join code: {a.joinCode}</div>
                    </div>
                    <span style={{ color: T.muted }}>›</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>My Associations</div>
          {mine.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              You haven't joined an association yet — use a join code from your coordinator below.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {mine.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/association/${a.id}`)}
                  style={{
                    padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: 8, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                  <span style={{ color: T.muted }}>›</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Join with Code</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              placeholder="e.g. JOIN0"
              style={{ flex: 1, padding: "10px 12px", fontSize: 14, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text }}
            />
            <button
              onClick={handleJoin}
              disabled={joining || !joinCode.trim()}
              style={{ padding: "10px 16px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
          {joinError && <div style={{ color: T.wrong, fontSize: 12, marginBottom: 20 }}>{joinError}</div>}

          <div style={{ padding: "16px 0 0", borderTop: `1px solid ${T.border}`, marginTop: joinError ? 0 : 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Coordinate a New Association</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
              Create a private group for officials under your supervision — assign modules and track completion.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Metro Basketball Officials Assoc."
                style={{ flex: 1, padding: "10px 12px", fontSize: 14, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text }}
              />
              <button
                onClick={handleCreate}
                disabled={creating || !name.trim()}
                style={{ padding: "10px 16px", background: T.red, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
            {createError && <div style={{ color: T.wrong, fontSize: 12, marginTop: 6 }}>{createError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
