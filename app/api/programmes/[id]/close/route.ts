import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session) || !session?.user?.id) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { reason } = body;

  // Snapshot latest outcome values
  type SnapshotRow = { key: string; value: number | null };
  const snap = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT o.key,
           (SELECT pt.value FROM "ProgrammeJourneyOutcomePoint" pt
            WHERE pt."outcomeId" = o.id ORDER BY pt."capturedAt" DESC LIMIT 1) AS value
    FROM "ProgrammeJourneyOutcome" o
    WHERE o."journeyId" = ${id}
  `;
  const snapshotObj: Record<string, number | null> = {};
  for (const s of snap) snapshotObj[s.key] = s.value;

  await prisma.$executeRaw`
    UPDATE "ProgrammeJourney" SET
      status = 'Closed',
      "closedAt" = NOW(),
      "closedReason" = ${reason ?? null},
      "closedById" = ${session.user.id},
      "outcomeSnapshot" = ${JSON.stringify(snapshotObj)}::jsonb,
      "updatedAt" = NOW()
    WHERE id = ${id}
  `;
  return Response.json({ ok: true, snapshot: snapshotObj });
}
