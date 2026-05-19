import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";

// PATCH /api/pitstops/bulk-order
// Body: { orders: { id: string; sortOrder: number }[] }
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { orders } = await req.json();
  if (!Array.isArray(orders)) return Response.json({ error: "orders required" }, { status: 400 });

  await prisma.$transaction(
    orders.map(({ id, sortOrder }: { id: string; sortOrder: number }) =>
      prisma.pitstop.update({ where: { id }, data: { order: sortOrder } })
    )
  );

  return Response.json({ ok: true });
}
