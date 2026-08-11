import { useMemo, useState } from "react";
import { T } from "../tokens";
import type { MechanicsScenario } from "../services/content";

// Tap-to-assign coverage-zone quiz (issue #20). Zones are large rectangles
// (min ~20% of the court's width/height) so touch targets comfortably clear
// the 44px minimum inside this app's 430px-max-width mobile layout.
export default function CoverageZoneQuiz({
  scenario, onComplete,
}: {
  scenario: MechanicsScenario;
  onComplete: (score: number) => void;
}) {
  const officials = useMemo(
    () => [...new Set(scenario.players.map(p => p.shortLabel))],
    [scenario.players],
  );

  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const allAssigned = scenario.zones.every(z => assignments[z.id]);
  const correctCount = scenario.zones.filter(z => assignments[z.id] === z.correctOfficial).length;
  const score = scenario.zones.length > 0 ? Math.round((correctCount / scenario.zones.length) * 100) : 0;

  function handleZoneTap(zoneId: string) {
    if (revealed) return;
    setSelectedZoneId(id => id === zoneId ? null : zoneId);
  }

  function handleAssign(official: string) {
    if (!selectedZoneId || revealed) return;
    setAssignments(a => ({ ...a, [selectedZoneId]: official }));
    setSelectedZoneId(null);
  }

  function handleCheck() {
    setRevealed(true);
  }

  function handleFinish() {
    onComplete(score);
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{scenario.title}</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{scenario.description}</div>
      </div>

      <svg viewBox="0 0 100 100" style={{ width: "100%", display: "block", background: "#EAF1FB", borderRadius: 8, marginBottom: 12 }}>
        <rect x="3" y="3" width="94" height="94" fill="none" stroke={T.navy} strokeWidth="0.6" opacity="0.5" />
        <rect x="34" y="3" width="32" height="20" fill="none" stroke={T.navy} strokeWidth="0.6" opacity="0.5" />
        <circle cx="50" cy="10" r="6" fill="none" stroke={T.navy} strokeWidth="0.6" opacity="0.5" />
        <path d="M 8 3 A 42 42 0 0 0 92 3" fill="none" stroke={T.navy} strokeWidth="0.6" opacity="0.5" />
        <circle cx="50" cy="8" r="1.4" fill={T.red} />

        {/* Coverage zones — the actual tap targets */}
        {scenario.zones.map((z) => {
          const assigned = assignments[z.id];
          const isSelected = selectedZoneId === z.id;
          let fill = "rgba(29,66,138,0.08)";
          let stroke = T.border;
          if (isSelected) { fill = "rgba(29,66,138,0.25)"; stroke = T.navy; }
          if (revealed && assigned) {
            const correct = assigned === z.correctOfficial;
            fill = correct ? "rgba(46,160,90,0.25)" : "rgba(200,16,46,0.2)";
            stroke = correct ? T.correct : T.wrong;
          }
          return (
            <g key={z.id} onClick={() => handleZoneTap(z.id)} style={{ cursor: revealed ? "default" : "pointer" }}>
              <rect
                x={Number(z.x)} y={Number(z.y)} width={Number(z.width)} height={Number(z.height)}
                fill={fill} stroke={stroke} strokeWidth={isSelected ? 1 : 0.6} rx="1.5"
              />
              <text
                x={Number(z.x) + Number(z.width) / 2}
                y={Number(z.y) + Number(z.height) / 2}
                textAnchor="middle" dominantBaseline="central"
                fontSize="6" fontWeight={700}
                fill={revealed ? (assigned === z.correctOfficial ? T.correct : T.wrong) : T.navy}
              >
                {assigned ?? "?"}
              </text>
              {revealed && assigned !== z.correctOfficial && (
                <text
                  x={Number(z.x) + Number(z.width) / 2}
                  y={Number(z.y) + Number(z.height) / 2 + 8}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize="4" fontWeight={600} fill={T.correct}
                >
                  ({z.correctOfficial})
                </text>
              )}
            </g>
          );
        })}

        {/* Crew reference positions — display only */}
        {scenario.players.map((p) => (
          <g key={p.id} transform={`translate(${Number(p.x)}, ${Number(p.y)})`}>
            <circle r="4" fill={T.navy} stroke={T.white} strokeWidth="0.5" />
            <text textAnchor="middle" dominantBaseline="central" fontSize="3.6" fontWeight={700} fill={T.white}>
              {p.shortLabel}
            </text>
          </g>
        ))}
      </svg>

      {!revealed && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6 }}>
            {selectedZoneId ? "Assign an official to the selected zone:" : "Tap a zone above, then assign an official"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {officials.map((o) => (
              <button
                key={o}
                onClick={() => handleAssign(o)}
                disabled={!selectedZoneId}
                style={{
                  minWidth: 44, minHeight: 44, padding: "0 16px",
                  background: selectedZoneId ? T.navy : T.border,
                  color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700,
                }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {!revealed ? (
        <button
          onClick={handleCheck}
          disabled={!allAssigned}
          style={{
            width: "100%", minHeight: 44, padding: "12px 0",
            background: allAssigned ? T.red : T.border, color: T.white,
            borderRadius: 8, fontSize: 15, fontWeight: 700,
          }}
        >
          Check Answers
        </button>
      ) : (
        <div>
          <div style={{
            padding: "12px 14px", marginBottom: 12, textAlign: "center",
            background: score >= 80 ? "#E6F4EC" : score >= 60 ? "#FFF6DC" : "#FDECEA",
            border: `1px solid ${score >= 80 ? T.correct : score >= 60 ? "#D9A400" : T.wrong}`,
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{score}%</div>
            <div style={{ fontSize: 12, color: T.muted }}>{correctCount}/{scenario.zones.length} zones correct</div>
          </div>
          <button
            onClick={handleFinish}
            style={{ width: "100%", minHeight: 44, padding: "12px 0", background: T.navy, color: T.white, borderRadius: 8, fontSize: 15, fontWeight: 700 }}
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
