import prisma from "@/lib/prisma";

/**
 * After a checklist item is marked Done, auto-advance its pitstop from
 * Upcoming → InProgress if this is the first completed item.
 * No-op if pitstop is already InProgress/Done/etc.
 */
export async function autoAdvancePitstopFromItem(itemId: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ pitstopId: string; pitstopStatus: string }[]>`
    SELECT ci."pitstopId", p.status::text AS "pitstopStatus"
    FROM "ChecklistItem" ci
    JOIN "Pitstop" p ON p.id = ci."pitstopId"
    WHERE ci.id = ${itemId}
    LIMIT 1
  `;
  if (!rows[0] || rows[0].pitstopStatus !== "Upcoming") return;

  await prisma.pitstop.updateMany({
    where: { id: rows[0].pitstopId, status: "Upcoming" },
    data: { status: "InProgress" },
  });
}

export async function autoAdvancePitstopById(pitstopId: string): Promise<void> {
  await prisma.pitstop.updateMany({
    where: { id: pitstopId, status: "Upcoming" },
    data: { status: "InProgress" },
  });
}
