import prisma from "@/lib/prisma";
import NewBudgetForm from "./NewBudgetForm";

const FIXED_VARS = new Set(["fixed_1", "fixed_12", "cosTotal", ""]);
// Always shown in "Programme scale" regardless of domain selection
const ALWAYS_CROSS_CUTTING = new Set(["nSettlements", "nClusters"]);

export type DomainInputField = {
  key: string;
  label: string;
  unit: string;
  defaultValue: number;
  isRent: boolean;
};

export type DomainOption = {
  key: string;
  label: string;
  description: string | null;
  city: string;
  inputs: DomainInputField[];
};

export default async function NewBudgetPage() {
  const [domainRows, templateRows, costRows] = await Promise.all([
    prisma.budgetDomainConfig.findMany({ where: { isActive: true }, orderBy: { position: "asc" } }),
    prisma.lineTemplate.findMany({
      where: { isActive: true },
      select: { city: true, domain: true, inputVar: true, userInputCost: true },
    }),
    prisma.costRegistry.findMany({ where: { itemKey: { startsWith: "inp." } } }),
  ]);

  // bare key → label/unit/defaultValue
  const inputMeta: Record<string, { label: string; unit: string; defaultValue: number }> = {};
  for (const r of costRows) {
    const key = r.itemKey.slice(4); // strip "inp."
    inputMeta[key] = { label: r.notes ?? key, unit: r.unit, defaultValue: r.unitCost };
  }

  // Per (city:domain): deduplicated inp keys with isRent flag
  type KeyEntry = { key: string; isRent: boolean };
  const domainKeyMap: Record<string, Record<string, KeyEntry>> = {};
  const keyDomainCount: Record<string, Set<string>> = {};

  for (const t of templateRows) {
    if (!t.domain) continue;
    const slot = `${t.city}:${t.domain}`;
    if (!domainKeyMap[slot]) domainKeyMap[slot] = {};

    const candidates: KeyEntry[] = [];
    if (t.inputVar && !FIXED_VARS.has(t.inputVar) && !ALWAYS_CROSS_CUTTING.has(t.inputVar))
      candidates.push({ key: t.inputVar, isRent: false });
    if (t.userInputCost && !ALWAYS_CROSS_CUTTING.has(t.userInputCost))
      candidates.push({ key: t.userInputCost, isRent: true });

    for (const entry of candidates) {
      domainKeyMap[slot][entry.key] = entry;
      if (!keyDomainCount[entry.key]) keyDomainCount[entry.key] = new Set();
      keyDomainCount[entry.key].add(t.domain);
    }
  }

  const domains: DomainOption[] = domainRows.map(d => {
    const slot = `${d.city}:${d.key}`;
    const inputs: DomainInputField[] = Object.values(domainKeyMap[slot] ?? {})
      .filter(e => (keyDomainCount[e.key]?.size ?? 0) < 2 && inputMeta[e.key])
      .map(e => ({ key: e.key, isRent: e.isRent, ...inputMeta[e.key] }));
    return { key: d.key, label: d.label, description: d.description, city: d.city, inputs };
  });

  // Cross-cutting = always-shown keys + any key used by 2+ domains
  const crossCuttingKeySet = new Set([
    ...ALWAYS_CROSS_CUTTING,
    ...Object.entries(keyDomainCount).filter(([, s]) => s.size >= 2).map(([k]) => k),
  ]);
  const crossCuttingInputs: DomainInputField[] = [...crossCuttingKeySet]
    .filter(k => inputMeta[k])
    .map(k => ({ key: k, isRent: false, ...inputMeta[k] }));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900">New Budget</h1>
        <p className="text-sm text-stone-500 mt-1">Select domains and enter programme scale to auto-generate a draft budget.</p>
      </div>
      <NewBudgetForm domains={domains} crossCuttingInputs={crossCuttingInputs} />
    </div>
  );
}
