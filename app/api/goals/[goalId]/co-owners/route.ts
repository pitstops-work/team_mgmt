import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { backfillEventAttendeeForCoOwner } from "@/lib/coOwnerBackfill";

export async function POST(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { userId } = await req.json();
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  await prisma.goalCoOwner.upsert({
    where: { goalId_userId: { goalId, userId } },
    create: { goalId, userId },
    update: {},
  });

  await backfillEventAttendeeForCoOwner(userId, { goalId });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, image: true } });
  return Response.json({ goalId, userId, user });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { userId } = await req.json();
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  await prisma.goalCoOwner.deleteMany({ where: { goalId, userId } });
  return Response.json({ ok: true });
}
