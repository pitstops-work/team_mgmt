import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DEFAULT_COSTS } from "@/lib/budget-costs";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  await auth(); // auth guard handled by layout

  const registry = await prisma.costRegistry.findMany({
    where: { city: "Bangalore" },
    orderBy: [{ domain: "asc" }, { itemKey: "asc" }],
  });

  const isSeeded = registry.length > 0;

  // Merge DB entries with defaults so we always show all items
  const merged = DEFAULT_COSTS.map(def => {
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

  return <AdminClient costs={merged} isSeeded={isSeeded} />;
}
