export type RegistryItem = { itemKey: string; unitCost: number; unit: string | null };

export type TemplateLike = {
  isSalaryStub: boolean;
  userInputCost: string | null;
  costKey: string | null;
  costKey2: string | null;
  costKey3: string | null;
  costMonthly: boolean;
  workerRatioKey: string | null;
  bufferKey: string | null;
  costPctOf: string | null;
  costPct: number | null;
};

export type CostComponent = { label: string; value: number };

function formatComponentLabel(itemKey: string, unitCost: number, unit: string | null): string {
  const v = Math.round(unitCost).toLocaleString("en-IN");
  if (!unit) return `${v} (${itemKey})`;
  const trimmed = unit.trim();
  if (trimmed.startsWith("₹/") || trimmed.startsWith("₹"))
    return `₹${v}${trimmed.slice(1)} (${itemKey})`;
  return `${v} ${trimmed} (${itemKey})`;
}

/**
 * Extract the cost-registry components that feed a LineTemplate's unit cost,
 * formatted for the Working sheet's structured columns. Returns up to 3
 * components (costKey, costKey2, costKey3). Worker-ratio and percent-of
 * templates fall back to showing whatever registry items they reference.
 */
export function extractCostComponents(t: TemplateLike, registry: RegistryItem[]): CostComponent[] {
  const idx = new Map<string, RegistryItem>(registry.map(r => [r.itemKey, r]));
  const comps: CostComponent[] = [];

  const push = (key: string | null) => {
    if (!key) return;
    const r = idx.get(key);
    if (!r) {
      comps.push({ label: `${key} (not found)`, value: 0 });
      return;
    }
    comps.push({ label: formatComponentLabel(r.itemKey, r.unitCost, r.unit), value: r.unitCost });
  };

  // Salary stub / user-input lines don't have cost-registry-driven components
  if (t.isSalaryStub || t.userInputCost) return [];

  // Worker-ratio templates: ratio × salary (× 12 × buffer-adjusted) — emit
  // ratio + salary, but the Working sheet will mark this as non-standard.
  if (t.workerRatioKey && t.costKey) {
    push(t.workerRatioKey);
    push(t.costKey);
    if (t.bufferKey) push(t.bufferKey);
    return comps;
  }

  // costPctOf: emit base + percentage as a synthetic second component
  if (t.costPctOf && t.costPct != null) {
    push(t.costPctOf);
    comps.push({ label: `${t.costPct}% of base`, value: t.costPct / 100 });
    return comps;
  }

  // Standard product
  push(t.costKey);
  push(t.costKey2);
  push(t.costKey3);
  return comps;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy human-readable cost-driver string (kept for any other consumer).
// The Working sheet no longer uses this — it shows the structured components
// in dedicated columns instead.
// ─────────────────────────────────────────────────────────────────────────────

const fmtIN = (n: number) => Math.round(n).toLocaleString("en-IN");

function fmtValueWithUnit(value: number, unit: string | null): string {
  const v = fmtIN(value);
  if (!unit) return v;
  const trimmed = unit.trim();
  if (trimmed.startsWith("₹/")) return `₹${v}${trimmed.slice(1)}`;
  if (trimmed.startsWith("₹")) return `₹${v}${trimmed.slice(1)}`;
  return `${v} ${trimmed}`;
}

export function formatCostDriver(t: TemplateLike, registry: RegistryItem[]): string {
  const idx = new Map<string, RegistryItem>(registry.map(r => [r.itemKey, r]));
  const reg = (key: string | null | undefined) => (key ? idx.get(key) ?? null : null);
  const part = (key: string | null) => {
    if (!key) return "";
    const r = idx.get(key);
    if (!r) return key;
    return fmtValueWithUnit(r.unitCost, r.unit);
  };

  if (t.isSalaryStub) return "Salary stub — user fills cost manually";
  if (t.userInputCost) return `User input field: ${t.userInputCost}`;
  if (t.costPctOf && t.costPct != null) {
    const base = reg(t.costPctOf);
    return `${t.costPct}% × ${base ? fmtValueWithUnit(base.unitCost, base.unit) : t.costPctOf}`;
  }
  if (t.workerRatioKey && t.costKey) {
    const ratio = reg(t.workerRatioKey);
    const salary = reg(t.costKey);
    const buffer = reg(t.bufferKey);
    const segs: string[] = [];
    segs.push(ratio ? fmtValueWithUnit(ratio.unitCost, ratio.unit) : t.workerRatioKey);
    segs.push(salary ? fmtValueWithUnit(salary.unitCost, salary.unit ?? "₹/month") : t.costKey);
    segs.push("12 months");
    let out = segs.join(" × ");
    if (buffer) out += ` × (1 + ${buffer.unitCost}% buffer)`;
    return out;
  }
  if (!t.costKey) return "";
  const segs: string[] = [];
  segs.push(part(t.costKey));
  if (t.costKey2) segs.push(part(t.costKey2));
  if (t.costKey3) segs.push(part(t.costKey3));
  if (t.costMonthly) segs.push("12 months");
  return segs.filter(s => s).join(" × ");
}
