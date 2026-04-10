import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  const defaultTo = new Date();
  const defaultFrom = new Date(defaultTo.getTime() - 14 * 24 * 60 * 60 * 1000);

  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : defaultFrom;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : defaultTo;

  const pitstops = await prisma.pitstop.findMany({
    where: {
      deletedAt: null,
      goal: { deletedAt: null },
      ownerId: { not: null },
      OR: [
        { targetDate: { gte: from, lte: to } },
        { completedAt: { gte: from, lte: to } },
        { status: "InProgress" },
      ],
    },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      goal: { select: { id: true, title: true } },
    },
    orderBy: { targetDate: "asc" },
  });

  type UserEntry = {
    user: { id: string; name: string | null; image: string | null };
    pitstops: typeof pitstops;
  };

  const byUser: Record<string, UserEntry> = {};
  pitstops.forEach((p) => {
    if (!p.ownerId) return;
    if (!byUser[p.ownerId]) byUser[p.ownerId] = { user: p.owner!, pitstops: [] };
    byUser[p.ownerId].pitstops.push(p);
  });

  return Response.json(Object.values(byUser));
}
