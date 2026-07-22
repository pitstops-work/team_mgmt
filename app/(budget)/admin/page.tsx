import { auth } from "@/lib/auth";
import { isBudgetAdmin } from "@/lib/roleGuard";
import prisma from "@/lib/prisma";
import { getDefaultsForCity } from "@/lib/budget-costs";
import AdminClient from "./AdminClient";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const session = await auth(); // auth guard handled by layout
  const budgetAdminOnly = isBudgetAdmin(session);

  const { city = "Bangalore" } = await searchParams;

  // "Others" is a placeholder city with no CostRegistry / LineTemplate /
  // BudgetDomainConfig / component rows of its own — Others budgets are
  // generated from Bangalore's standard set (see budget/actions.ts createBudget).
  // Mirror that here so Cost Analysis has a standard to compare Others budgets
  // against. cityBudgets stays on the real city so the dropdown still lists them.
  const sourceCity = city === "Others" ? "Bangalore" : city;

  const [registry, templates, domains, cityRecords, needsDomains, cityBudgets, components] = await Promise.all([
    prisma.costRegistry.findMany({
      where: { city: sourceCity },
      orderBy: [{ domain: "asc" }, { itemKey: "asc" }],
    }),
    prisma.lineTemplate.findMany({
      where: { city: sourceCity },
      orderBy: { position: "asc" },
    }),
    prisma.budgetDomainConfig.findMany({
      where: { city: sourceCity },
      orderBy: { position: "asc" },
    }),
    prisma.city.findMany({ where: { name: city }, select: { id: true } }),
    prisma.needsFormulaConfig.findMany({
      where: { isActive: true, domainType: { not: "entitlement" } },
      select: { domain: true, label: true },
      orderBy: { sortOrder: "asc" },
    }),
    // All budgets for this city, surfaced in the Cost Analysis "Compare with"
    // dropdown. Most recent first so the active drafting cycle is at the top.
    prisma.budget.findMany({
      where: { city },
      select: { id: true, name: true, createdAt: true, domains: true, horizonMonths: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.costRegistryComponent.findMany({
      where: { city: sourceCity },
      orderBy: { position: "asc" },
      select: { parentItemKey: true, label: true, spec: true, qty: true, unitCost: true },
    }),
  ]);

  // Component breakup (the "working") grouped by the aggregate item it derives.
  const componentsByKey: Record<string, { label: string; spec: string | null; qty: number; unitCost: number }[]> = {};
  for (const c of components) {
    (componentsByKey[c.parentItemKey] ??= []).push({ label: c.label, spec: c.spec, qty: c.qty, unitCost: c.unitCost });
  }

  const cityIds = cityRecords.map(c => c.id);
  const zones = await prisma.zone.findMany({
    where: cityIds.length > 0
      ? { cityId: { in: cityIds }, deletedAt: null }
      : { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const isSeeded = registry.length > 0;
  const defaults = getDefaultsForCity(sourceCity);

  const defaultKeys = new Set(defaults.map(d => d.itemKey));
  const merged = [
    ...defaults.map(def => {
      const db = registry.find(r => r.itemKey === def.itemKey);
      return {
        id: db?.id ?? null,
        domain: def.domain ?? null,
        itemKey: def.itemKey,
        unit: def.unit,
        notes: db?.notes ?? def.notes ?? null,
        defaultCost: def.unitCost,
        currentCost: db?.unitCost ?? def.unitCost,
        isEdited: db ? db.unitCost !== def.unitCost : false,
        displayGroup: db?.displayGroup ?? null,
        needsDomain: db?.needsDomain ?? null,
        derivation: db?.derivation ?? null,
      };
    }),
    // Custom items added via admin (not in defaults)
    ...registry
      .filter(r => !defaultKeys.has(r.itemKey))
      .map(r => ({
        id: r.id,
        domain: r.domain ?? null,
        itemKey: r.itemKey,
        unit: r.unit,
        notes: r.notes,
        defaultCost: r.unitCost,
        currentCost: r.unitCost,
        isEdited: false,
        displayGroup: r.displayGroup ?? null,
        needsDomain: r.needsDomain ?? null,
        derivation: r.derivation ?? null,
      })),
  ];

  // Serialize Date to ISO so AdminClient stays a pure client component.
  const cityBudgetsSerialized = cityBudgets.map(b => ({
    id: b.id, name: b.name, createdAt: b.createdAt.toISOString(),
    domains: b.domains, horizonMonths: b.horizonMonths,
  }));

  return <AdminClient costs={merged} isSeeded={isSeeded} city={city} templates={templates} domains={domains} zones={zones} needsDomains={needsDomains} cityBudgets={cityBudgetsSerialized} budgetAdminOnly={budgetAdminOnly} componentsByKey={componentsByKey} />;
}
