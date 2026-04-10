import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { pitstopId } = await params;

  const checkins = await prisma.pitstopCheckin.findMany({
    where: { pitstopId },
    include: { user: { select: { id: true, name: true, image: true } } },
    orderBy: { date: "desc" },
    take: 20,
  });

  return Response.json(checkins);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { pitstopId } = await params;
  const { status, note, nextSteps } = await req.json();

  if (!status) return Response.json({ error: "status required" }, { status: 400 });

  const checkin = await prisma.pitstopCheckin.create({
    data: { pitstopId, userId: session.user.id, status, note, nextSteps },
    include: { user: { select: { id: true, name: true, image: true } } },
  });

  // Write audit log
  await prisma.auditLog.create({
    data: {
      entityType: "Pitstop",
      entityId: pitstopId,
      userId: session.user.id,
      action: "checkin",
      newValue: status,
      field: "checkin_status",
    },
  });

  return Response.json(checkin);
}
