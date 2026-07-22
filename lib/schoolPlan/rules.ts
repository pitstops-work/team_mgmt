// Three computed rules for a school plan (deviation, capacity, food-cost).
// Called from the plan page and the cross-plan board.

export type BudgetLineLite = {
  section: string;                       // BudgetSection value
  templateKey: string | null;
  y1Total: number;
};

export type CostRegistryItemLite = {
  itemKey: string;
  unitCost: number;
  // For programme-line derivations that need a scale (e.g. food × children).
  scaleUnits?: number;
};

// ---------- Rule 1: recurring-cost deviation vs standard ----------

/** ₹ (not lakh). Standard recurring Y1 per school per the annexure = the
 *  sum of Salary + Travel + Programme lines. Passed in so callers can compute
 *  it from CostRegistry rather than hard-coding it here. */
export function computeStandardRecurringY1(items: readonly CostRegistryItemLite[]): number {
  // Convention: standard items with itemKey prefix "asc.opex." roll into the
  // recurring standard. Callers control which items to include.
  return items.reduce((s, it) => s + it.unitCost * (it.scaleUnits ?? 1), 0);
}

/** Sum a budget's recurring Y1 (everything except capex). */
export function computeSchoolRecurringY1(lines: readonly BudgetLineLite[]): number {
  return lines
    .filter((l) => l.section !== "capex")
    .reduce((s, l) => s + (l.y1Total || 0), 0);
}

/** Deviation % vs standard. Positive = school is above standard.
 *  Returns null if no standard is defined yet (avoids -100% at zero-fill). */
export function computeDeviationPct(
  schoolRecurringY1: number,
  standardRecurringY1: number,
): number | null {
  if (!standardRecurringY1 || standardRecurringY1 <= 0) return null;
  return ((schoolRecurringY1 - standardRecurringY1) / standardRecurringY1) * 100;
}

/** |deviation| > 10 %. */
export function isDeviationOverThreshold(pct: number | null, threshold = 10): boolean {
  return pct !== null && Math.abs(pct) > threshold;
}

// ---------- Rule 2: capacity reconciliation ----------

export function computeSpaceCapacity(spaces: readonly {
  capacityPerSession: number | null;
  sessionsPerDay: number | null;
}[]): number {
  return spaces.reduce(
    (s, sp) => s + (sp.capacityPerSession ?? 0) * (sp.sessionsPerDay ?? 1),
    0,
  );
}

export function capacityShortfall(dailyCapacity: number, target: number | null): number {
  if (target == null) return 0;
  return Math.max(0, target - dailyCapacity);
}

// ---------- Rule 3: food/snacks auto-scale ----------

/** Standard food-cost line = ₹12 × children/day × 365. Returns rupees. */
export function computeFoodCostY1(childrenPerDay: number | null, ratePerChildPerDay = 12): number {
  if (!childrenPerDay || childrenPerDay <= 0) return 0;
  return ratePerChildPerDay * childrenPerDay * 365;
}

/** ₹ per child per year at standard 300/day (~₹36,000 per child per year — the
 *  key threshold cited in the GC status note). */
export function computeCostPerChildPerYear(
  recurringY1: number,
  childrenPerDay: number | null,
): number | null {
  if (!childrenPerDay || childrenPerDay <= 0) return null;
  return recurringY1 / childrenPerDay;
}
