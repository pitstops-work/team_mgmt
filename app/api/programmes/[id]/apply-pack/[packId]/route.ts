import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";
import { randomUUID } from "crypto";

type Pack = { outcomes: unknown };

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; packId: string }> },
) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, packId } = await params;
  const packRows = await prisma.$queryRaw<Pack[]>`
    SELECT outcomes FROM "ProgrammeJourneyOutcomeTemplate" WHERE id = ${packId} LIMIT 1
  `;
  const pack = packRows[0];
  if (!pack) return Response.json({ error: "Pack not found" }, { status: 404 });

  const journeyRows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) AS c FROM "ProgrammeJourney" WHERE id = ${id}
  `;
  if (Number(journeyRows[0]?.c ?? 0) === 0) return Response.json({ error: "Journey not found" }, { status: 404 });

  const outcomes = pack.outcomes as Array<{
    key: string;
    label: string;
    description?: string | null;
    unit?: string | null;
    captureSource?: string;
    bindingTemplateSlug?: string | null;
    bindingChecklistKey?: string | null;
    targetValue?: number | null;
    targetCadence?: string | null;
    sortOrder?: number;
  }>;

  let created = 0, skipped = 0;
  for (const o of outcomes) {
    if (!o.key || !o.label) { skipped++; continue; }
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "ProgrammeJourneyOutcome" WHERE "journeyId" = ${id} AND key = ${o.key} LIMIT 1
    `;
    if (existing[0]) { skipped++; continue; }
    const captureSource = o.captureSource ?? "MANUAL_ADMIN";
    await prisma.$executeRaw`
      INSERT INTO "ProgrammeJourneyOutcome" (
        id, "journeyId", key, label, description, unit,
        "captureSource", "bindingTemplateSlug", "bindingChecklistKey",
        "targetValue", "targetCadence", "sortOrder", "isActive",
        "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${id}, ${o.key}, ${o.label}, ${o.description ?? null}, ${o.unit ?? null},
        ${captureSource}, ${o.bindingTemplateSlug ?? null}, ${o.bindingChecklistKey ?? null},
        ${o.targetValue ?? null}, ${o.targetCadence ?? null}, ${o.sortOrder ?? 0}, true,
        NOW(), NOW()
      )
    `;
    created++;
  }

  return Response.json({ created, skipped });
}
