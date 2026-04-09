import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || session.user.id;
  const year  = parseInt(searchParams.get("year")  || String(new Date().getFullYear()));
  const quarter = parseInt(searchParams.get("quarter") || "1");

  const qStart = new Date(year, (quarter - 1) * 3, 1);
  const qEnd   = new Date(year, quarter * 3, 1);

  const items = await prisma.planItem.findMany({
    where: {
      userId,
      deletedAt: null,
      date: { gte: qStart, lt: qEnd },
    },
    include: {
      pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description, date, type, pitstopId, userId } = await req.json();
  if (!title?.trim() || !date) return NextResponse.json({ error: "Title and date required" }, { status: 400 });

  const targetUserId = userId || session.user.id;

  const item = await prisma.planItem.create({
    data: {
      id: randomUUID(),
      title: title.trim(),
      description: description?.trim() || null,
      date: new Date(date),
      type: type || "Note",
      userId: targetUserId,
      pitstopId: pitstopId || null,
    },
    include: {
      pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
    },
  });

  return NextResponse.json(item, { status: 201 });
}
