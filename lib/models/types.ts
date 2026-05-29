// Operating Models — shared types.
// Mirrors the Prisma rows for ModelTemplate/Group/Node/Output/Instance but in a
// shape the engine can consume without dragging Prisma into pure modules.

/** A horizon defines one time base a template uses. */
export type Horizon = {
  /** Reference key, e.g. "monthly" or "annual". Unique within a template. */
  key: string;
  /** Number of periods in this horizon, e.g. 60 for 5 years monthly. */
  length: number;
};

/** Shape declares whether a node is scalar or a vector tied to a horizon. */
export type NodeShape =
  | { kind: "scalar" }
  | { kind: "vector"; horizon: string };

export type NodeKind = "input" | "formula" | "constant";

export type DataType =
  | "number"
  | "percent"
  | "currency"
  | "int"
  | "boolean"
  | "enum";

export type ModelNode = {
  key: string;
  label: string;
  notes?: string | null;
  unit?: string | null;
  kind: NodeKind;
  dataType: DataType;
  shape: NodeShape;
  /** Default for input/constant nodes. Number, boolean, string, or number[]. */
  default?: NodeValue;
  /** Source for formula nodes. */
  formula?: string | null;
  enumValues?: readonly string[] | null;
  groupKey?: string | null;
  order?: number;
};

export type ModelGroup = { key: string; label: string; order?: number };

export type OutputKind =
  | "kpi"
  | "series"
  | "seriesGroup"
  | "table"
  | "sensitivity"
  | "scenarioGrid"
  | "budgetExport";

/** Config shape for `seriesGroup` outputs: N node-series plotted as grouped
 *  bars over the same horizon. Each entry is one bar-color in the group. */
export type SeriesGroupConfig = {
  horizon: string;
  format?: string;
  series: { nodeKey: string; label: string; color: string }[];
};

export type ModelOutput = {
  key: string;
  label: string;
  kind: OutputKind;
  config: Record<string, unknown>;
  order?: number;
};

export type ModelTemplate = {
  key: string;
  name: string;
  description?: string;
  horizons: Horizon[];
  groups: ModelGroup[];
  nodes: ModelNode[];
  outputs: ModelOutput[];
};

/** A value flowing through the engine. */
export type Scalar = number | boolean;
export type NodeValue = Scalar | number[] | string;

/** Sparse override of node defaults. */
export type InstanceInputs = Record<string, NodeValue>;

/** Engine output: every node resolved to its final value. */
export type ComputeResult = {
  values: Record<string, NodeValue>;
  /** Per-node error if evaluation failed (e.g. divide by zero, bad formula). */
  errors: Record<string, string>;
};
