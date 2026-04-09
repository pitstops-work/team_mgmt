import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId  = searchParams.get("userId") || session.user.id;
  const year    = parseInt(searchParams.get("year")    || String(new Date().getFullYear()));
  const quarter = parseInt(searchParams.get("quarter") || "1");

  const qStart = new Date(year, (quarter - 1) * 3, 1);
  const qEnd   = new Date(year, quarter * 3, 1);

  const [pitstops, activities, planItems] = await Promise.all([
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        goal: { deletedAt: null },
        ownerId: userId,
        OR: [
          { startDate:  { gte: qStart, lt: qEnd } },
          { targetDate: { gte: qStart, lt: qEnd } },
          { startDate: { lt: qEnd }, targetDate: { gte: qStart } },
        ],
      },
      select: {
        id: true, title: true, status: true, type: true,
        startDate: true, targetDate: true,
        goal: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true, image: true } },
      },
    }),

    prisma.pitstopEvent.findMany({
      where: {
        deletedAt: null,
        scheduledAt: { gte: qStart, lt: qEnd },
        attendees: { some: { userId } },
      },
      select: {
        id: true, title: true, type: true, scheduledAt: true, location: true,
        pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
        attendees: { select: { userId: true, user: { select: { id: true, name: true, image: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),

    prisma.planItem.findMany({
      where: {
        userId,
        deletedAt: null,
        date: { gte: qStart, lt: qEnd },
      },
      include: {
        pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  return NextResponse.json({ pitstops, activities, planItems });
}
