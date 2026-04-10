import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? session.user.id;
  const days   = parseInt(searchParams.get("days") ?? "7");
  const since  = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const logs = await prisma.standupLog.findMany({
    where: {
      ...(userId === "all" ? {} : { userId }),
      date: { gte: since },
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      pitstops: {
        include: {
          pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
        },
      },
    },
    orderBy: { date: "desc" },
    take: 50,
  });

  return Response.json(logs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { yesterday, today, blockers, pitstopIds, date } = await req.json();

  const log = await prisma.standupLog.create({
    data: {
      userId: session.user.id,
      date: date ? new Date(date) : new Date(),
      yesterday,
      today,
      blockers,
      pitstops: pitstopIds?.length
        ? { create: pitstopIds.map((pid: string) => ({ pitstopId: pid })) }
        : undefined,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      pitstops: {
        include: {
          pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
        },
      },
    },
  });

  return Response.json(log);
}
