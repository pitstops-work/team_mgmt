"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DEFAULT_COSTS } from "@/lib/budget-costs";
import { revalidatePath } from "next/cache";

export async function seedCostRegistry() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  await prisma.$transaction(
    DEFAULT_COSTS.map(c =>
      prisma.costRegistry.upsert({
        where: { city_itemKey: { city: "Bangalore", itemKey: c.itemKey } },
        create: {
          city: "Bangalore",
          domain: c.domain ?? undefined,
          itemKey: c.itemKey,
          unitCost: c.unitCost,
          unit: c.unit,
          effectiveYear: 2025,
          notes: c.notes,
        },
        update: {},  // Don't overwrite edits
      })
    )
  );

  revalidatePath("/admin");
}

export async function updateCostRegistry(id: string, unitCost: number, notes?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  await prisma.costRegistry.update({
    where: { id },
    data: { unitCost, notes },
  });
  revalidatePath("/admin");
}

export async function resetCostRegistry(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const entry = await prisma.costRegistry.findUnique({ where: { id } });
  if (!entry) return;

  const def = DEFAULT_COSTS.find(c => c.itemKey === entry.itemKey);
  if (!def) return;

  await prisma.costRegistry.update({
    where: { id },
    data: { unitCost: def.unitCost, notes: def.notes },
  });
  revalidatePath("/admin");
}
