import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  await prisma.threadSubscription.upsert({
    where: { userId_threadId: { userId: session.user.id, threadId } },
    create: { userId: session.user.id, threadId },
    update: {},
  });
  return Response.json({ subscribed: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  await prisma.threadSubscription.deleteMany({
    where: { userId: session.user.id, threadId },
  });
  return Response.json({ subscribed: false });
}
