import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Resolve a settlement name or id to a Settlement.id. */
async function resolveSettlementId(nameOrId: string): Promise<string | null> {
  // Try direct id match first (cuid format)
  const byId = await prisma.settlement.findUnique({ where: { id: nameOrId }, select: { id: true } });
  if (byId) return byId.id;
  // Fall back to name match
  const byName = await prisma.settlement.findFirst({
    where: { name: nameOrId, deletedAt: null },
    select: { id: true },
  });
  return byName?.id ?? null;
}

export async function GET(request: Request) {
  const settlement = new URL(request.url).searchParams.get("settlement");
  if (!settlement) return NextResponse.json({ error: "Missing settlement" }, { status: 400 });

  const settlementId = await resolveSettlementId(settlement);
  if (!settlementId) return NextResponse.json({ note: "" });

  const row = await prisma.settlementNote.findUnique({ where: { settlementId } });
  return NextResponse.json({ note: row?.note ?? "" });
}

export async function PUT(request: Request) {
  const { settlement, note } = await request.json();
  if (!settlement) return NextResponse.json({ error: "Missing settlement" }, { status: 400 });

  const settlementId = await resolveSettlementId(settlement);
  if (!settlementId) return NextResponse.json({ error: "Settlement not found" }, { status: 404 });

  await prisma.settlementNote.upsert({
    where: { settlementId },
    create: { settlementId, note: String(note ?? "") },
    update: { note: String(note ?? "") },
  });

  return NextResponse.json({ ok: true });
}
