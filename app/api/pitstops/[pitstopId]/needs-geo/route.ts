import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { viewerForbidden } from "@/lib/roleGuard";

// PATCH /api/pitstops/[pitstopId]/needs-geo
// Sets needsSettlementId / needsClusterId / needsZoneId on a pitstop.
// Pass null to clear. Exactly one of the three should be set (or all null).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pitstopId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { pitstopId } = await params;
  const { needsSettlementId, needsClusterId, needsZoneId } = await req.json();

  const updated = await prisma.pitstop.update({
    where: { id: pitstopId },
    data: {
      needsSettlementId: needsSettlementId ?? null,
      needsClusterId: needsClusterId ?? null,
      needsZoneId: needsZoneId ?? null,
    },
    select: { id: true, needsSettlementId: true, needsClusterId: true, needsZoneId: true },
  });

  return NextResponse.json(updated);
}
