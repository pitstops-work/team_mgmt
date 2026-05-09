import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDefaultsForCity } from "@/lib/budget-costs";
import AdminClient from "./AdminClient";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  await auth(); // auth guard handled by layout

  const { city = "Bangalore" } = await searchParams;

  const [registry, templates, domains] = await Promise.all([
    prisma.costRegistry.findMany({
      where: { city },
      orderBy: [{ domain: "asc" }, { itemKey: "asc" }],
    }),
    prisma.lineTemplate.findMany({
      where: { city },
      orderBy: { position: "asc" },
    }),
    prisma.budgetDomainConfig.findMany({
      where: { city },
      orderBy: { position: "asc" },
    }),
  ]);

  const isSeeded = registry.length > 0;
  const defaults = getDefaultsForCity(city);

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
      })),
  ];

  return <AdminClient costs={merged} isSeeded={isSeeded} city={city} templates={templates} domains={domains} />;
}
