import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return Response.json({ goals: [], pitstops: [], messages: [] });

  const [goals, pitstops, messages] = await Promise.all([
    prisma.goal.findMany({
      where: {
        deletedAt: null,
        OR: [
          { title: { contains: q } },
          { description: { contains: q } },
        ],
      },
      include: { owner: { select: { id: true, name: true } } },
      take: 5,
    }),
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        OR: [
          { title: { contains: q } },
          { notes: { contains: q } },
        ],
      },
      include: { goal: { select: { id: true, title: true } } },
      take: 5,
    }),
    prisma.message.findMany({
      where: { deletedAt: null, body: { contains: q } },
      include: {
        author: { select: { id: true, name: true } },
        thread: { include: { pitstop: { include: { goal: true } } } },
      },
      take: 5,
    }),
  ]);

  return Response.json({ goals, pitstops, messages });
}
