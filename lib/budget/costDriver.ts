export type RegistryItem = { itemKey: string; unitCost: number; unit: string | null };

type TemplateLike = {
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

const fmtIN = (n: number) => Math.round(n).toLocaleString("en-IN");

// Combines a value and its registry unit string into a single token.
// If the unit starts with "₹/" (rupee-denominated, e.g. "₹/workshop"), strip the
// "₹/" and prepend "₹" to the value to produce "₹9,000/workshop". Otherwise,
// keep value and unit separate ("8 workshops/year").
function fmtValueWithUnit(value: number, unit: string | null): string {
  const v = fmtIN(value);
  if (!unit) return v;
  const trimmed = unit.trim();
  if (trimmed.startsWith("₹/")) return `₹${v}${trimmed.slice(1)}`; // "/workshop"
  if (trimmed.startsWith("₹")) return `₹${v}${trimmed.slice(1)}`;
  return `${v} ${trimmed}`;
}

/**
 * Produce a human-readable string explaining how a LineTemplate's unit cost
 * is derived from the cost registry. Used on the Working sheet.
 */
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
