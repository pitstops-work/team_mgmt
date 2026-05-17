import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";

type PointRow = {
  id: string;
  value: number;
  capturedAt: Date;
  source: string;
  capturedById: string | null;
  capturedByName: string | null;
  sourceRefId: string | null;
  note: string | null;
  createdAt: Date;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; outcomeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { outcomeId } = await params;
  const rows = await prisma.$queryRaw<PointRow[]>`
    SELECT p.id, p.value, p."capturedAt", p.source,
           p."capturedById", u.name AS "capturedByName",
           p."sourceRefId", p.note, p."createdAt"
    FROM "ProgrammeJourneyOutcomePoint" p
    LEFT JOIN "User" u ON u.id = p."capturedById"
    WHERE p."outcomeId" = ${outcomeId}
    ORDER BY p."capturedAt" ASC
  `;
  return Response.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; outcomeId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { outcomeId } = await params;
  const body = await req.json();
  const { value, capturedAt, note } = body;
  if (typeof value !== "number" || isNaN(value)) {
    return Response.json({ error: "value (number) required" }, { status: 400 });
  }
  const capturedAtDate = capturedAt ? new Date(capturedAt) : new Date();

  const pointId = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "ProgrammeJourneyOutcomePoint" (
      id, "outcomeId", value, "capturedAt", source,
      "capturedById", note, "createdAt"
    ) VALUES (
      ${pointId}, ${outcomeId}, ${value}, ${capturedAtDate},
      'MANUAL_ADMIN', ${session.user.id}, ${note ?? null}, NOW()
    )
  `;
  return Response.json({ id: pointId }, { status: 201 });
}
