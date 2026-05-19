import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";

// PATCH /api/goals/[goalId]/pitstops/reorder
// Body: { orderedIds: string[] }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { goalId } = await params;
  const { orderedIds } = await req.json();
  if (!Array.isArray(orderedIds)) return Response.json({ error: "orderedIds required" }, { status: 400 });

  await prisma.$transaction(
    orderedIds.map((id: string, index: number) =>
      prisma.pitstop.update({ where: { id, goalId }, data: { order: index } })
    )
  );

  return Response.json({ ok: true });
}
