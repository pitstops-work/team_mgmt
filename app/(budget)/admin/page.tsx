import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDefaultsForCity } from "@/lib/budget-costs";
import AdminClient from "./AdminClient";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  await auth(); // auth guard handled by layout

  const { city = "Bangalore" } = await searchParams;

  const [registry, templates] = await Promise.all([
    prisma.costRegistry.findMany({
      where: { city },
      orderBy: [{ domain: "asc" }, { itemKey: "asc" }],
    }),
    prisma.lineTemplate.findMany({
      where: { city },
      orderBy: { position: "asc" },
    }),
  ]);

  const isSeeded = registry.length > 0;
  const defaults = getDefaultsForCity(city);

  const merged = defaults.map(def => {
    const db = registry.find(r => r.itemKey === def.itemKey);
    return {
      id: db?.id ?? null,
      domain: def.domain,
      itemKey: def.itemKey,
      unit: def.unit,
      notes: db?.notes ?? def.notes ?? null,
      defaultCost: def.unitCost,
      currentCost: db?.unitCost ?? def.unitCost,
      isEdited: db ? db.unitCost !== def.unitCost : false,
    };
  });

  return <AdminClient costs={merged} isSeeded={isSeeded} city={city} templates={templates} />;
}
