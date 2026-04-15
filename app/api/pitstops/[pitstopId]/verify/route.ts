import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST: toggle verification on a pitstop
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pitstopId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;

  const pitstop = await prisma.pitstop.findUnique({
    where: { id: pitstopId },
    select: { id: true, verifiedById: true, goalId: true, title: true, ownerId: true, goal: { select: { followers: { select: { userId: true } } } } },
  });
  if (!pitstop) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isRemoving = pitstop.verifiedById === session.user.id;

  const updated = await prisma.pitstop.update({
    where: { id: pitstopId },
    data: {
      verifiedById: isRemoving ? null : session.user.id,
      verifiedAt: isRemoving ? null : new Date(),
    },
    select: {
      id: true,
      verifiedById: true,
      verifiedAt: true,
      verifiedBy: { select: { id: true, name: true, image: true } },
    },
  });

  // Notify the pitstop owner if someone else verified it
  if (!isRemoving && pitstop.ownerId && pitstop.ownerId !== session.user.id) {
    await prisma.notification.create({
      data: {
        userId: pitstop.ownerId,
        type: "PitstopVerified",
        title: "Pitstop verified",
        body: `"${pitstop.title}" was marked as verified.`,
        link: `/goals/${pitstop.goalId}/pitstops/${pitstopId}`,
      },
    });
  }

  return NextResponse.json(updated);
}
