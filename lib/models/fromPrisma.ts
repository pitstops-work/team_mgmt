// Convert DB rows (ModelTemplate + nested) into the engine's ModelTemplate shape.

import type {
  DataType,
  Horizon,
  ModelGroup,
  ModelNode,
  ModelOutput,
  ModelTemplate,
  NodeKind,
  NodeShape,
  NodeUi,
  NodeValue,
  OutputKind,
  Surface,
  Tier,
} from "./types";

// Minimal structural types for what we receive from Prisma. Avoids a hard
// dependency on the generated Prisma row types here.
type DbTemplate = {
  key: string;
  name: string;
  description: string;
  horizons: unknown;
  groups: DbGroup[];
  nodes: DbNode[];
  outputs: DbOutput[];
};
type DbGroup = { key: string; label: string; order: number; surface?: string };
type DbNode = {
  key: string; label: string; notes: string | null; unit: string | null;
  kind: string; dataType: string; shape: unknown; defaultJson: unknown;
  formula: string | null; enumValues: unknown; order: number;
  surface?: string; tier?: string; uiJson?: unknown;
  group: { key: string } | null;
};
type DbOutput = { key: string; label: string; kind: string; config: unknown; order: number };

export function toEngineTemplate(t: DbTemplate): ModelTemplate {
  const horizons = Array.isArray(t.horizons) ? (t.horizons as Horizon[]) : [];
  const groups: ModelGroup[] = t.groups.map(g => ({
    key: g.key, label: g.label, order: g.order,
    surface: (g.surface ?? "both") as Surface,
  }));
  const nodes: ModelNode[] = t.nodes.map(n => ({
    key: n.key, label: n.label, notes: n.notes, unit: n.unit,
    kind: n.kind as NodeKind, dataType: n.dataType as DataType,
    shape: (n.shape ?? { kind: "scalar" }) as NodeShape,
    default: (n.defaultJson ?? undefined) as NodeValue | undefined,
    formula: n.formula,
    enumValues: Array.isArray(n.enumValues) ? (n.enumValues as string[]) : null,
    groupKey: n.group?.key ?? null,
    surface: (n.surface ?? "both") as Surface,
    tier: (n.tier ?? "basic") as Tier,
    ui: (n.uiJson ?? null) as NodeUi | null,
    order: n.order,
  }));
  const outputs: ModelOutput[] = t.outputs.map(o => ({
    key: o.key, label: o.label, kind: o.kind as OutputKind,
    config: (o.config ?? {}) as Record<string, unknown>,
    order: o.order,
  }));
  return {
    key: t.key, name: t.name, description: t.description,
    horizons, groups, nodes, outputs,
  };
}
