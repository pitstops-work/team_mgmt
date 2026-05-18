import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";
import { randomUUID } from "crypto";

/**
 * Creates a super-journey (no primaryDomain — gathers child journeys across
 * domains for the same settlement). Pass childIds[] to attach existing
 * journeys; their parentId will be set.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { label, settlementId, childIds, notes } = body;
  if (!label || !settlementId) return Response.json({ error: "label + settlementId required" }, { status: 400 });

  // Sanity: all childIds must share the same settlementId
  if (Array.isArray(childIds) && childIds.length > 0) {
    type Row = { settlementId: string; parentId: string | null };
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "settlementId", "parentId" FROM "ProgrammeJourney" WHERE id = ANY(${childIds})
    `;
    if (rows.some(r => r.settlementId !== settlementId)) {
      return Response.json({ error: "All children must belong to the same settlement" }, { status: 400 });
    }
    if (rows.some(r => r.parentId)) {
      return Response.json({ error: "Some children already belong to a super-journey" }, { status: 400 });
    }
  }

  const id = randomUUID();
  const settlementRows = await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM "Settlement" WHERE id = ${settlementId}`;
  const settlementName = settlementRows[0]?.name ?? settlementId;
  const key = `super-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${id.slice(0, 6)}`;

  await prisma.$executeRaw`
    INSERT INTO "ProgrammeJourney" (id, key, label, "primaryDomain", "settlementId", status, notes, "createdAt", "updatedAt")
    VALUES (${id}, ${key}, ${`${label} · ${settlementName}`}, NULL, ${settlementId}, 'Active', ${notes ?? null}, NOW(), NOW())
  `;

  if (Array.isArray(childIds) && childIds.length > 0) {
    for (const childId of childIds) {
      await prisma.$executeRaw`
        UPDATE "ProgrammeJourney" SET "parentId" = ${id}, "updatedAt" = NOW() WHERE id = ${childId}
      `;
    }
  }
  return Response.json({ id }, { status: 201 });
}
