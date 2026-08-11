import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { T } from "../tokens";
import { contentService, type MechanicsScenario } from "../services/content";
import { userService } from "../services/user";
import { useAuthStore } from "../store/authStore";
import CoverageZoneQuiz from "../components/CoverageZoneQuiz";

const MECHANICS_ARTICLE_ID = "ncaa_basketball:mechanics";

export default function MechanicsScenarioPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [scenario,  setScenario]  = useState<MechanicsScenario | null>(null);
  const [allIds,    setAllIds]    = useState<string[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);

  useEffect(() => {
    if (!scenarioId) return;
    setLoading(true);
    setError(null);
    setFinalScore(null);
    Promise.all([
      contentService.getMechanicsScenario(scenarioId),
      contentService.listMechanicsScenarios(),
    ]).then(([s, all]) => {
      if (!s) { setError("Scenario not found."); return; }
      setScenario(s);
      setAllIds(all.map(x => x.id));
    }).catch(() => setError("Couldn't load this scenario."))
      .finally(() => setLoading(false));
  }, [scenarioId]);

  function handleComplete(score: number) {
    setFinalScore(score);
    if (isAuthenticated) {
      userService.recordArticleStudied(MECHANICS_ARTICLE_ID, score).catch(() => {});
    }
  }

  function nextScenario() {
    if (!scenarioId || allIds.length === 0) { navigate("/study"); return; }
    const idx = allIds.indexOf(scenarioId);
    const next = allIds[(idx + 1) % allIds.length];
    navigate(`/mechanics/${next}`);
  }

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: T.muted, paddingTop: 80 }}>Loading…</div>;

  if (error || !scenario) {
    return (
      <div style={{ padding: 24, textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{error ?? "Scenario not found."}</div>
        <button onClick={() => navigate("/study")} style={{ padding: "13px 32px", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}>
          Back to Study
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      <div style={{ background: T.navy, padding: "52px 20px 20px", color: T.white }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🎯</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Coverage Zone Drill</span>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {Number(scenario.crewSize)}-person crew mechanics
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <CoverageZoneQuiz key={scenario.id} scenario={scenario} onComplete={handleComplete} />

        {finalScore !== null && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => navigate("/study")}
              style={{ flex: 1, padding: "12px 0", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
            >
              Back to Study
            </button>
            <button
              onClick={nextScenario}
              style={{ flex: 1, padding: "12px 0", background: T.red, color: T.white, borderRadius: 8, fontSize: 13, fontWeight: 700 }}
            >
              Next Scenario →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
