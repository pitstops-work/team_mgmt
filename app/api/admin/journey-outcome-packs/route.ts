import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";
import { randomUUID } from "crypto";

type PackRow = {
  id: string;
  key: string;
  label: string;
  domain: string | null;
  notes: string | null;
  outcomes: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.$queryRaw<PackRow[]>`
    SELECT id, key, label, domain, notes, outcomes, "createdAt", "updatedAt"
    FROM "ProgrammeJourneyOutcomeTemplate"
    ORDER BY label ASC
  `;
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { key, label, domain, notes, outcomes } = body;
  if (!key || !label) return Response.json({ error: "key + label required" }, { status: 400 });
  if (!Array.isArray(outcomes)) return Response.json({ error: "outcomes must be an array" }, { status: 400 });

  const id = randomUUID();
  try {
    await prisma.$executeRaw`
      INSERT INTO "ProgrammeJourneyOutcomeTemplate" (id, key, label, domain, notes, outcomes, "createdAt", "updatedAt")
      VALUES (${id}, ${key}, ${label}, ${domain ?? null}, ${notes ?? null}, ${JSON.stringify(outcomes)}::jsonb, NOW(), NOW())
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique")) return Response.json({ error: "Pack key already exists" }, { status: 409 });
    return Response.json({ error: msg }, { status: 500 });
  }
  return Response.json({ id }, { status: 201 });
}
