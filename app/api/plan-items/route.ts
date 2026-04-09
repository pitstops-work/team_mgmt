import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";

const pitstopsInclude = {
  pitstops: {
    select: {
      pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
    },
  },
} as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId  = searchParams.get("userId") || session.user.id;
  const year    = parseInt(searchParams.get("year")    || String(new Date().getFullYear()));
  const quarter = parseInt(searchParams.get("quarter") || "1");

  const FY_START_MONTH = [3, 6, 9, 0];
  const startMonth = FY_START_MONTH[quarter - 1];
  const startYear  = quarter === 4 ? year + 1 : year;
  const qStart = new Date(startYear, startMonth, 1);
  const qEnd   = new Date(startYear, startMonth + 3, 1);

  const items = await prisma.planItem.findMany({
    where: { userId, deletedAt: null, date: { gte: qStart, lt: qEnd } },
    include: pitstopsInclude,
    orderBy: { date: "asc" },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description, date, endDate, type, pitstopIds = [], userId } = await req.json();
  if (!title?.trim() || !date) return NextResponse.json({ error: "Title and date required" }, { status: 400 });

  const item = await prisma.planItem.create({
    data: {
      id: randomUUID(),
      title: title.trim(),
      description: description?.trim() || null,
      date: new Date(date),
      endDate: endDate ? new Date(endDate) : null,
      type: type || "Note",
      userId: userId || session.user.id,
      pitstops: {
        create: pitstopIds.map((pitstopId: string) => ({ pitstopId })),
      },
    },
    include: pitstopsInclude,
  });

  return NextResponse.json(item, { status: 201 });
}
