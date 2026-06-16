import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { backfillEventAttendeeForCoOwner } from "@/lib/coOwnerBackfill";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const coOwners = await prisma.pitstopCoOwner.findMany({
    where: { pitstopId },
    include: { user: { select: { id: true, name: true, image: true } } },
  });
  return Response.json(coOwners);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { userId } = await req.json();
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  await prisma.pitstopCoOwner.upsert({
    where: { pitstopId_userId: { pitstopId, userId } },
    create: { pitstopId, userId },
    update: {},
  });

  await backfillEventAttendeeForCoOwner(userId, { pitstopId });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, image: true } });
  return Response.json({ pitstopId, userId, user });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { userId } = await req.json();
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  await prisma.pitstopCoOwner.deleteMany({ where: { pitstopId, userId } });
  return Response.json({ ok: true });
}
