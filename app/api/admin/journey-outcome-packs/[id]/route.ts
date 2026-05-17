import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const { label, domain, notes, outcomes } = body;
  await prisma.$executeRaw`
    UPDATE "ProgrammeJourneyOutcomeTemplate" SET
      label = COALESCE(${label ?? null}::text, label),
      domain = CASE WHEN ${domain !== undefined}::boolean THEN ${domain ?? null}::text ELSE domain END,
      notes = CASE WHEN ${notes !== undefined}::boolean THEN ${notes ?? null}::text ELSE notes END,
      outcomes = CASE WHEN ${outcomes !== undefined}::boolean THEN ${outcomes ? JSON.stringify(outcomes) : "[]"}::jsonb ELSE outcomes END,
      "updatedAt" = NOW()
    WHERE id = ${id}
  `;
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.$executeRaw`DELETE FROM "ProgrammeJourneyOutcomeTemplate" WHERE id = ${id}`;
  return Response.json({ ok: true });
}
