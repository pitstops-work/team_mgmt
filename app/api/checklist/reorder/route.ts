import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";

// PATCH /api/checklist/reorder
// Body: { pitstopId, itemId, direction: "up" | "down" }
// Swaps the `order` of itemId with its neighbor in direction.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { pitstopId, itemId, direction } = await req.json();
  if (!pitstopId || !itemId || !["up", "down"].includes(direction)) {
    return Response.json({ error: "Invalid params" }, { status: 400 });
  }

  const items = await prisma.checklistItem.findMany({
    where: { pitstopId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });

  const idx = items.findIndex(i => i.id === itemId);
  if (idx === -1) return Response.json({ error: "Not found" }, { status: 404 });

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= items.length) {
    return Response.json({ ok: true }); // already at boundary
  }

  const current = items[idx];
  const neighbor = items[swapIdx];

  await prisma.$transaction([
    prisma.checklistItem.update({ where: { id: current.id }, data: { order: neighbor.order } }),
    prisma.checklistItem.update({ where: { id: neighbor.id }, data: { order: current.order } }),
  ]);

  return Response.json({ ok: true });
}
