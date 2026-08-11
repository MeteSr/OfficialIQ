import { useEffect, useState } from "react";
import { T } from "../tokens";
import type { CourtDiagram as CourtDiagramData, DiagramPlayer } from "../services/content";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function Court({
  diagram, reducedMotion, selectedId, onSelect,
}: {
  diagram: CourtDiagramData;
  reducedMotion: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const byId = new Map(diagram.players.map(p => [p.id, p]));
  const selected = selectedId ? byId.get(selectedId) : null;

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        @keyframes courtDiagramArrowDraw {
          from { stroke-dashoffset: 100; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
      <svg viewBox="0 0 100 100" style={{ width: "100%", display: "block", background: "#EAF1FB", borderRadius: 8 }}>
        {/* Court markings */}
        <rect x="3" y="3" width="94" height="94" fill="none" stroke={T.navy} strokeWidth="0.6" opacity="0.5" />
        <rect x="34" y="3" width="32" height="20" fill="none" stroke={T.navy} strokeWidth="0.6" opacity="0.5" />
        <circle cx="50" cy="10" r="6" fill="none" stroke={T.navy} strokeWidth="0.6" opacity="0.5" />
        <path d="M 8 3 A 42 42 0 0 0 92 3" fill="none" stroke={T.navy} strokeWidth="0.6" opacity="0.5" />
        <circle cx="50" cy="8" r="1.4" fill={T.red} />

        {/* Arrows */}
        {diagram.arrows.map((a, i) => {
          const from = byId.get(a.fromId);
          const to = byId.get(a.toId);
          if (!from || !to) return null;
          const dashed = a.style === "dashed";
          return (
            <line
              key={i}
              x1={Number(from.x)} y1={Number(from.y)} x2={Number(to.x)} y2={Number(to.y)}
              stroke={T.red}
              strokeWidth="1"
              strokeDasharray={dashed ? "3,2" : reducedMotion ? undefined : "100"}
              strokeDashoffset={reducedMotion ? undefined : 0}
              markerEnd="url(#courtDiagramArrowhead)"
              style={!reducedMotion && !dashed ? { animation: "courtDiagramArrowDraw 900ms ease-out forwards" } : undefined}
            />
          );
        })}
        <defs>
          <marker id="courtDiagramArrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={T.red} />
          </marker>
        </defs>

        {/* Players */}
        {diagram.players.map((p) => (
          <g
            key={p.id}
            transform={`translate(${p.x}, ${p.y})`}
            onClick={() => onSelect(selectedId === p.id ? null : p.id)}
            style={{ cursor: "pointer" }}
          >
            <circle
              r="4.2"
              fill={p.shortLabel.startsWith("D") ? T.navy : T.correct}
              stroke={selectedId === p.id ? T.red : T.white}
              strokeWidth={selectedId === p.id ? 0.9 : 0.5}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="3.4"
              fontWeight={700}
              fill={T.white}
            >
              {p.shortLabel}
            </text>
          </g>
        ))}
      </svg>

      {selected && (
        <div
          style={{
            position: "absolute",
            left: `${Math.min(78, Math.max(2, Number(selected.x)))}%`,
            top: `${Math.min(85, Math.max(2, Number(selected.y) + 6))}%`,
            maxWidth: 180,
            background: T.navy, color: T.white,
            borderRadius: 6, padding: "6px 9px", fontSize: 11,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          <strong>{selected.shortLabel}</strong> — {selected.role}
        </div>
      )}
    </div>
  );
}

export default function CourtDiagram({ diagram }: { diagram: CourtDiagramData }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = useReducedMotion();

  if (diagram.players.length === 0) return null;

  return (
    <div style={{ marginTop: 10, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>COURT DIAGRAM</span>
        <button
          onClick={() => setExpanded(true)}
          style={{ fontSize: 11, fontWeight: 600, color: T.navy, background: "transparent" }}
        >
          ⤢ Expand
        </button>
      </div>
      <Court diagram={diagram} reducedMotion={reducedMotion} selectedId={selectedId} onSelect={setSelectedId} />

      {expanded && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(10,12,20,0.92)",
            zIndex: 1000, display: "flex", flexDirection: "column",
            justifyContent: "center", padding: 20,
          }}
          onClick={() => setExpanded(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 430, margin: "0 auto", width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button onClick={() => setExpanded(false)} style={{ color: T.white, fontSize: 22, background: "transparent" }}>✕</button>
            </div>
            <Court diagram={diagram} reducedMotion={reducedMotion} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </div>
      )}
    </div>
  );
}

export type { DiagramPlayer };
