import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  await prisma.goalFollow.upsert({
    where: { userId_goalId: { userId: session.user.id, goalId } },
    create: { userId: session.user.id, goalId },
    update: {},
  });
  return Response.json({ following: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  await prisma.goalFollow.deleteMany({
    where: { userId: session.user.id, goalId },
  });
  return Response.json({ following: false });
}
