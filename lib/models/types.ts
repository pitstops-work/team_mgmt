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

/** Which play surface a group/node belongs to (tab-filtering in the workbench). */
export type Surface = "finance" | "sim" | "both";

/** Sim-tab Basic/Advanced detail tier. */
export type Tier = "basic" | "advanced";

/** Optional slider config for sim-tab inputs. */
export type NodeUi = { min?: number; max?: number; step?: number };

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
  /** Surface override; "both" defers to the group's surface. */
  surface?: Surface;
  /** Sim-tab tier; ignored on finance/editor tabs. */
  tier?: Tier;
  /** Slider range; present → render slider on the sim tab. */
  ui?: NodeUi | null;
  order?: number;
};

export type ModelGroup = { key: string; label: string; order?: number; surface?: Surface };

export type OutputKind =
  | "kpi"
  | "series"
  | "seriesGroup"
  | "table"
  | "sensitivity"
  | "scenarioGrid"
  | "budgetExport"
  | "daySim";

/** Config for a `daySim` output: a day-in-the-life operations simulation. The
 *  `nodes` map wires resolved instance node values into the sim's parameters, so
 *  the simulation reads the same inputs as the finance model (one source of
 *  truth). `schematic` selects which plant renderer to draw. */
export type RoDaySimConfig = {
  schematic: "ro_water";
  nodes: {
    lph: string;          // plant capacity, L/hour
    tankCap: string;      // product tank size, L
    cansCount: string;    // pre-packed 10 L cans (reserve)
    hh: string;           // households in service area
    adoption: string;     // steady-state adoption fraction
    lpd: string;          // litres per adopting HH per day
    peak: string;         // peak-concentration lever
    price: string;        // effective price per litre (after pass discount)
    opexMonthly: string;  // total steady-state monthly opex (for per-day economics)
    operatingDays?: string; // operating days per month (opex divisor); defaults to 30
  };
};

/** Multi-service sanitation complex: toilets + bathing + laundry + RO water,
 *  with the greywater → DEWATS → recycled loop. Throughput/recovery keys are
 *  optional (advanced-tier sim nodes); the engine falls back to defaults. */
export type ComplexDaySimConfig = {
  schematic: "sanitation_complex";
  nodes: {
    hh: string; personsPerHH: string; adoption: string; peak: string;
    seats: string; baths: string; machines: string; roLph: string; dewatsKld: string;
    roTankCap: string; roCansCount: string;
    toiletUses: string; bathShare: string; roLitresPerHH: string;
    priceToilet: string; priceBath: string; priceLaundry: string; priceRo: string;
    passPrice: string; passShare: string; freeQuota: string;
    opexMonthly: string;
    opexToilet?: string; opexBath?: string; opexLaundry?: string; opexRo?: string; opexShared?: string;
    seatThroughput?: string; bathThroughput?: string; machineThroughput?: string; roRecovery?: string;
  };
};

export type DaySimConfig = RoDaySimConfig | ComplexDaySimConfig;

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
