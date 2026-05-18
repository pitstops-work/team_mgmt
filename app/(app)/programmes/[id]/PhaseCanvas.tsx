"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Trash2 } from "lucide-react";

export type CanvasPhase = {
  id: string;
  label: string;
  goalId: string | null;
  goalTitle: string | null;
  goalStatus: string | null;
  status: string;
  canvasX: number | null;
  canvasY: number | null;
};
export type CanvasEdge = { id: string; fromPhaseId: string; toPhaseId: string; label: string | null };

const NODE_W = 180;
const NODE_H = 64;
const COL_W = 240;
const ROW_H = 110;
const PADDING = 24;

const STATUS_BG: Record<string, string> = {
  Planned: "#f5f5f4",  // stone-100
  Active:  "#e0f2fe",  // sky-100
  Done:    "#dcfce7",  // emerald-100
  Skipped: "#f5f5f4",
};
const STATUS_BORDER: Record<string, string> = {
  Planned: "#d6d3d1",
  Active:  "#7dd3fc",
  Done:    "#86efac",
  Skipped: "#d6d3d1",
};

/**
 * Auto-layout: assign each node a column = its longest path from any root, and
 * stack siblings vertically within a column.
 */
function autoLayout(phases: CanvasPhase[], edges: CanvasEdge[]): Map<string, { x: number; y: number }> {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    (outgoing.get(e.fromPhaseId) ?? outgoing.set(e.fromPhaseId, []).get(e.fromPhaseId)!).push(e.toPhaseId);
    (incoming.get(e.toPhaseId) ?? incoming.set(e.toPhaseId, []).get(e.toPhaseId)!).push(e.fromPhaseId);
  }
  // Column = longest distance from any root (no incoming edges)
  const column = new Map<string, number>();
  const visit = (id: string, depth: number, seen: Set<string>): number => {
    if (seen.has(id)) return depth; // break cycles
    seen.add(id);
    const ins = incoming.get(id) ?? [];
    if (ins.length === 0) {
      column.set(id, Math.max(column.get(id) ?? 0, depth));
      return depth;
    }
    let max = 0;
    for (const p of ins) max = Math.max(max, visit(p, depth + 1, new Set(seen)));
    column.set(id, Math.max(column.get(id) ?? 0, max));
    return max;
  };
  for (const p of phases) visit(p.id, 0, new Set());

  // Actual column = max depth - column[id] (so roots are at column 0)
  const maxCol = Math.max(0, ...Array.from(column.values()));
  const colOf = (id: string) => maxCol - (column.get(id) ?? 0);

  // Stack within each column
  const byCol = new Map<number, string[]>();
  for (const p of phases) {
    const c = colOf(p.id);
    (byCol.get(c) ?? byCol.set(c, []).get(c)!).push(p.id);
  }
  const layout = new Map<string, { x: number; y: number }>();
  for (const [c, ids] of byCol) {
    ids.sort((a, b) => {
      const pa = phases.find(x => x.id === a)!;
      const pb = phases.find(x => x.id === b)!;
      return pa.label.localeCompare(pb.label);
    });
    ids.forEach((id, i) => {
      layout.set(id, { x: PADDING + c * COL_W, y: PADDING + i * ROW_H });
    });
  }
  return layout;
}

export default function PhaseCanvas({
  journeyId,
  phases,
  edges,
  onChanged,
}: {
  journeyId: string;
  phases: CanvasPhase[];
  edges: CanvasEdge[];
  onChanged: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [dragging, setDragging] = useState<{ id: string; offX: number; offY: number } | null>(null);
  const [connecting, setConnecting] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);

  // Initialize positions: prefer stored canvasX/Y, else auto-layout.
  useEffect(() => {
    const auto = autoLayout(phases, edges);
    const next = new Map<string, { x: number; y: number }>();
    for (const p of phases) {
      if (p.canvasX != null && p.canvasY != null) {
        next.set(p.id, { x: p.canvasX, y: p.canvasY });
      } else {
        next.set(p.id, auto.get(p.id) ?? { x: PADDING, y: PADDING });
      }
    }
    setPositions(next);
  }, [phases, edges]);

  // Save a position to the server (debounced)
  const persistPos = useCallback(async (phaseId: string, x: number, y: number) => {
    await fetch(`/api/programmes/${journeyId}/phases/${phaseId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canvasX: Math.round(x), canvasY: Math.round(y) }),
    });
  }, [journeyId]);

  const handleNodeMouseDown = (e: React.MouseEvent, phaseId: string) => {
    if ((e.target as HTMLElement).closest(".handle-out")) return;
    const pos = positions.get(phaseId);
    if (!pos) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragging({ id: phaseId, offX: e.clientX - rect.left - pos.x, offY: e.clientY - rect.top - pos.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (dragging) {
      const nx = Math.max(0, e.clientX - rect.left - dragging.offX);
      const ny = Math.max(0, e.clientY - rect.top - dragging.offY);
      setPositions(prev => new Map(prev).set(dragging.id, { x: nx, y: ny }));
    } else if (connecting) {
      setConnecting({ ...connecting, x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    if (dragging) {
      const pos = positions.get(dragging.id);
      if (pos) await persistPos(dragging.id, pos.x, pos.y);
      setDragging(null);
    }
    if (connecting) {
      // Did we end over a node?
      const target = (e.target as HTMLElement).closest("[data-phase-id]") as HTMLElement | null;
      if (target) {
        const targetId = target.getAttribute("data-phase-id");
        if (targetId && targetId !== connecting.fromId) {
          await fetch(`/api/programmes/${journeyId}/edges`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fromPhaseId: connecting.fromId, toPhaseId: targetId }),
          });
          onChanged();
        }
      }
      setConnecting(null);
    }
  };

  const handleHandleMouseDown = (e: React.MouseEvent, phaseId: string) => {
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setConnecting({ fromId: phaseId, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleEdgeDelete = async (edgeId: string) => {
    await fetch(`/api/programmes/${journeyId}/edges/${edgeId}`, { method: "DELETE" });
    onChanged();
  };

  // Compute SVG size
  const maxX = Math.max(800, ...Array.from(positions.values()).map(p => p.x + NODE_W + PADDING));
  const maxY = Math.max(400, ...Array.from(positions.values()).map(p => p.y + NODE_H + PADDING));

  const edgePaths = useMemo(() => edges.map(e => {
    const a = positions.get(e.fromPhaseId);
    const b = positions.get(e.toPhaseId);
    if (!a || !b) return null;
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const dx = Math.max(60, (x2 - x1) / 2);
    const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
    return { ...e, path, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 };
  }).filter(Boolean) as ({ id: string; fromPhaseId: string; toPhaseId: string; label: string | null; path: string; midX: number; midY: number })[],
  [edges, positions]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { setDragging(null); setConnecting(null); }}
      className="relative border border-stone-200 rounded-xl bg-stone-50 overflow-auto"
      style={{ minHeight: 400, height: maxY + 60, userSelect: dragging || connecting ? "none" : undefined }}
    >
      <svg className="absolute inset-0 pointer-events-none" width={maxX} height={maxY} style={{ overflow: "visible" }}>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#a8a29e" />
          </marker>
          <marker id="arrow-hover" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#ef4444" />
          </marker>
        </defs>
        {edgePaths.map(e => (
          <g key={e.id}>
            <path
              d={e.path}
              stroke={hoverEdgeId === e.id ? "#ef4444" : "#a8a29e"}
              strokeWidth={hoverEdgeId === e.id ? 2 : 1.5}
              fill="none"
              markerEnd={hoverEdgeId === e.id ? "url(#arrow-hover)" : "url(#arrow)"}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onMouseEnter={() => setHoverEdgeId(e.id)}
              onMouseLeave={() => setHoverEdgeId(null)}
              onClick={() => handleEdgeDelete(e.id)}
            />
            {hoverEdgeId === e.id && (
              <g pointerEvents="none">
                <circle cx={e.midX} cy={e.midY} r="11" fill="#ef4444" />
                <path d={`M${e.midX - 4} ${e.midY - 4} L${e.midX + 4} ${e.midY + 4} M${e.midX + 4} ${e.midY - 4} L${e.midX - 4} ${e.midY + 4}`} stroke="white" strokeWidth="2" />
              </g>
            )}
          </g>
        ))}
        {connecting && (
          <line
            x1={(positions.get(connecting.fromId)?.x ?? 0) + NODE_W}
            y1={(positions.get(connecting.fromId)?.y ?? 0) + NODE_H / 2}
            x2={connecting.x}
            y2={connecting.y}
            stroke="#7dd3fc"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
        )}
      </svg>
      {phases.map(p => {
        const pos = positions.get(p.id);
        if (!pos) return null;
        return (
          <div
            key={p.id}
            data-phase-id={p.id}
            onMouseDown={(e) => handleNodeMouseDown(e, p.id)}
            className="absolute select-none cursor-grab active:cursor-grabbing rounded-lg shadow-sm transition-shadow hover:shadow-md"
            style={{
              left: pos.x, top: pos.y, width: NODE_W, height: NODE_H,
              background: STATUS_BG[p.status] ?? "#fafaf9",
              border: `1.5px solid ${STATUS_BORDER[p.status] ?? "#d6d3d1"}`,
            }}
          >
            <div className="px-2.5 py-1.5 text-xs font-medium text-stone-800 truncate">{p.label}</div>
            <div className="px-2.5 text-[10px] text-stone-500 truncate">
              {p.goalTitle ?? <span className="italic">no goal</span>}
            </div>
            <div className="absolute bottom-1 left-2.5 text-[9px] uppercase tracking-wider text-stone-400">{p.status}</div>
            <div
              className="handle-out absolute right-[-7px] top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-sky-400 rounded-full cursor-crosshair hover:bg-sky-100"
              onMouseDown={(e) => handleHandleMouseDown(e, p.id)}
              title="Drag to another phase to add an edge"
            />
          </div>
        );
      })}
      {phases.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-stone-400 italic">No phases yet.</p>
      )}
      <p className="absolute bottom-2 right-3 text-[10px] text-stone-400">
        Drag nodes to reposition · drag the right handle to connect · click an edge to remove
      </p>
    </div>
  );
}
