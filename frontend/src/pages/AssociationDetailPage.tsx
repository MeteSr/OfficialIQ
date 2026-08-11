import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { useAuthStore } from "../store/authStore";
import { associationService, type AssociationRec, type Assignment, type Completion } from "../services/association";
import { userService, type UserProfile } from "../services/user";
import { rankingService, type UserStats } from "../services/ranking";
import { contentService, type Article } from "../services/content";
import { Principal } from "@icp-sdk/core/principal";

const SPORT_ID = "ncaa_basketball";

type RosterRow = { principal: string; displayName: string; accuracy: number; streak: number };

function fmtDate(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleDateString();
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AssociationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, principal } = useAuthStore();

  const [assoc,       setAssoc]       = useState<AssociationRec | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [roster,      setRoster]      = useState<RosterRow[]>([]);
  const [articles,    setArticles]    = useState<Article[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const [showAssignForm, setShowAssignForm] = useState(false);
  const [title,      setTitle]      = useState("");
  const [selectedArticles, setSelectedArticles] = useState<string[]>([]);
  const [casebook,   setCasebook]   = useState(true);
  const [dueDate,    setDueDate]    = useState("");
  const [targetAll,  setTargetAll]  = useState(true);
  const [targetSubset, setTargetSubset] = useState<string[]>([]);
  const [assigning,  setAssigning]  = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [completionsByAssignment, setCompletionsByAssignment] = useState<Record<string, Completion[]>>({});

  const isCoordinator = !!assoc && !!principal && assoc.coordinator.toString() === principal;

  function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    associationService.getAssociation(id).then(async (rec) => {
      if (!rec) { setError("Association not found, or you don't have access."); return; }
      setAssoc(rec);
      const [assigns, memberPrincipals, arts] = await Promise.all([
        associationService.getAssociationAssignments(id),
        associationService.getAssociationMembers(id),
        contentService.listArticles(SPORT_ID, "varsity"),
      ]);
      setAssignments([...assigns].sort((a, b) => Number(b.createdAt - a.createdAt)));
      setArticles([...arts].sort((a, b) => Number(a.number) - Number(b.number)));

      const rows = await Promise.all(memberPrincipals.map(async (p): Promise<RosterRow> => {
        const [prof, stats] = await Promise.all([
          userService.getProfile(p).catch(() => null as UserProfile | null),
          rankingService.getStats(p).catch(() => null as UserStats | null),
        ]);
        return {
          principal: p.toString(),
          displayName: prof?.displayName ?? "(unnamed official)",
          accuracy: stats ? Math.round(stats.accuracy * 100) : 0,
          streak: stats ? Number(stats.streak) : 0,
        };
      }));
      setRoster(rows.sort((a, b) => b.accuracy - a.accuracy));

      if (rec.coordinator.toString() === principal) {
        const comps = await Promise.all(assigns.map(a => associationService.getAssignmentCompletions(a.id)));
        setCompletionsByAssignment(Object.fromEntries(assigns.map((a, i) => [a.id, comps[i]])));
      }
    }).catch(() => setError("Couldn't load this association."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated, id]);

  async function handleAssign() {
    if (!id || !title.trim() || selectedArticles.length === 0 || !dueDate) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const dueAtMs = new Date(dueDate + "T23:59:59").getTime();
      const targets = targetAll ? [] : targetSubset.map(p => Principal.fromText(p));
      await associationService.createAssignment(id, title.trim(), selectedArticles, casebook, dueAtMs, targets);
      setTitle(""); setSelectedArticles([]); setDueDate(""); setTargetAll(true); setTargetSubset([]);
      setShowAssignForm(false);
      load();
    } catch (e: any) {
      setAssignError(e.message ?? "Couldn't assign this module");
    } finally {
      setAssigning(false);
    }
  }

  function exportCsv(a: Assignment) {
    const comps = completionsByAssignment[a.id] ?? [];
    const byMember = new Map(comps.map(c => [c.member.toString(), c]));
    const rows: string[][] = [["Official", "Status", "Score", "Completed At"]];
    roster.forEach((r) => {
      const c = byMember.get(r.principal);
      rows.push([r.displayName, c ? "Completed" : "Pending", c ? String(Number(c.score)) : "", c ? fmtDate(c.completedAt) : ""]);
    });
    downloadCsv(`${a.title.replace(/[^a-z0-9]+/gi, "_")}_completion.csv`, rows);
  }

  if (!isAuthenticated) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Sign in to view this association.</div>
        <button onClick={() => navigate("/me")} style={{ padding: "12px 24px", background: T.navy, color: T.white, borderRadius: 8, fontWeight: 700 }}>
          Go to Sign In
        </button>
      </div>
    );
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>Loading…</div>;

  if (error || !assoc) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{error ?? "Association not found."}</div>
        <button onClick={() => navigate("/association")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          Back to Associations
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{assoc.name}</div>
        {isCoordinator && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
            Join code: <strong>{assoc.joinCode}</strong> — share this with officials to invite them
          </div>
        )}
      </div>

      <div style={{ padding: 16 }}>
        {/* Roster / leaderboard — visible to coordinator and all members */}
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
          Members ({roster.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
          {roster.map((r, i) => (
            <div key={r.principal} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
            }}>
              <span style={{ fontSize: 12, color: T.muted, minWidth: 18 }}>{i + 1}.</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{r.displayName}</span>
              <span style={{ fontSize: 12, color: T.muted }}>{r.accuracy}% acc.{r.streak > 0 && ` · 🔥 ${r.streak}`}</span>
            </div>
          ))}
        </div>

        {/* Assignments */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Assigned Modules</div>
          {isCoordinator && (
            <button
              onClick={() => setShowAssignForm(s => !s)}
              style={{ fontSize: 12, color: T.navy, fontWeight: 700, background: "transparent" }}
            >
              {showAssignForm ? "Cancel" : "+ Assign Module"}
            </button>
          )}
        </div>

        {showAssignForm && (
          <div style={{ padding: 14, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 16 }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Complete Art. 4-5 quiz by Friday"
              style={{ width: "100%", padding: "9px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, marginBottom: 10, boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 6 }}>Articles</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {articles.map((a) => {
                const on = selectedArticles.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedArticles(s => on ? s.filter(x => x !== a.id) : [...s, a.id])}
                    style={{
                      padding: "5px 10px", borderRadius: 6, fontSize: 12,
                      background: on ? T.navy : T.surface, color: on ? T.white : T.text,
                      border: `1px solid ${on ? T.navy : T.border}`,
                    }}
                  >Art. {Number(a.number)}</button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12 }}>Include casebook plays</span>
              <input type="checkbox" checked={casebook} onChange={e => setCasebook(e.target.checked)} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 6 }}>Due date</div>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{ width: "100%", padding: "9px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, marginBottom: 10, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12 }}>Assign to all members</span>
              <input type="checkbox" checked={targetAll} onChange={e => setTargetAll(e.target.checked)} />
            </div>
            {!targetAll && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10, maxHeight: 140, overflowY: "auto" }}>
                {roster.map((r) => {
                  const on = targetSubset.includes(r.principal);
                  return (
                    <label key={r.principal} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <input
                        type="checkbox" checked={on}
                        onChange={() => setTargetSubset(s => on ? s.filter(x => x !== r.principal) : [...s, r.principal])}
                      />
                      {r.displayName}
                    </label>
                  );
                })}
              </div>
            )}
            {assignError && <div style={{ color: T.wrong, fontSize: 12, marginBottom: 8 }}>{assignError}</div>}
            <button
              onClick={handleAssign}
              disabled={assigning || !title.trim() || selectedArticles.length === 0 || !dueDate}
              style={{ width: "100%", padding: "10px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
            >
              {assigning ? "Assigning…" : "Assign Module"}
            </button>
          </div>
        )}

        {assignments.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted }}>No modules assigned yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {assignments.map((a) => {
              const comps = completionsByAssignment[a.id];
              const targetCount = a.targetMembers.length > 0 ? a.targetMembers.length : roster.length;
              const doneCount = comps?.length ?? 0;
              const pct = targetCount > 0 ? Math.round((doneCount / targetCount) * 100) : 0;
              const buckets = [0, 0, 0, 0, 0]; // <60, 60-69, 70-79, 80-89, 90-100
              comps?.forEach((c) => {
                const s = Number(c.score);
                const idx = s < 60 ? 0 : s < 70 ? 1 : s < 80 ? 2 : s < 90 ? 3 : 4;
                buckets[idx] += 1;
              });
              return (
                <div key={a.id} style={{ padding: "12px 14px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>
                    Due {fmtDate(a.dueAt)} · {a.targetMembers.length > 0 ? `${a.targetMembers.length} assigned` : "All members"}
                  </div>
                  {isCoordinator && comps !== undefined && (
                    <>
                      <div style={{ height: 6, background: T.bg, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: T.navy, borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>
                        {doneCount}/{targetCount} completed ({pct}%)
                        {doneCount > 0 && ` · score dist: ${buckets.join("/")}`}
                      </div>
                      <button
                        onClick={() => exportCsv(a)}
                        style={{ fontSize: 11, color: T.navy, fontWeight: 700, background: "transparent" }}
                      >
                        ⬇ Export CSV
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
