import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const settlement = new URL(request.url).searchParams.get("settlement");
  if (!settlement) return NextResponse.json({ error: "Missing settlement" }, { status: 400 });

  const row = await prisma.settlementNote.findUnique({ where: { settlement } });
  return NextResponse.json({ note: row?.note ?? "" });
}

export async function PUT(request: Request) {
  const { settlement, note } = await request.json();
  if (!settlement) return NextResponse.json({ error: "Missing settlement" }, { status: 400 });

  await prisma.settlementNote.upsert({
    where: { settlement },
    create: { settlement, note: String(note ?? "") },
    update: { note: String(note ?? "") },
  });

  return NextResponse.json({ ok: true });
}
