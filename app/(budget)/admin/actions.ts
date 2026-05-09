"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDefaultsForCity } from "@/lib/budget-costs";
import { revalidatePath } from "next/cache";

export async function seedCostRegistry(city = "Bangalore") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const defaults = getDefaultsForCity(city);
  await prisma.$transaction(
    defaults.map(c =>
      prisma.costRegistry.upsert({
        where: { city_itemKey: { city, itemKey: c.itemKey } },
        create: {
          city,
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

  const defaults = getDefaultsForCity(entry.city);
  const def = defaults.find(c => c.itemKey === entry.itemKey);
  if (!def) return;

  await prisma.costRegistry.update({
    where: { id },
    data: { unitCost: def.unitCost, notes: def.notes },
  });
  revalidatePath("/admin");
}
