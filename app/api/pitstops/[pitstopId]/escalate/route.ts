import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendPushToUsers } from "@/lib/push";

export async function POST(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { escalatedToId, note } = await req.json();

  if (!escalatedToId) return Response.json({ error: "escalatedToId required" }, { status: 400 });

  const pitstop = await prisma.pitstop.findUnique({
    where: { id: pitstopId },
    select: { title: true, goalId: true },
  });
  if (!pitstop) return Response.json({ error: "Not found" }, { status: 404 });

  const escalation = await prisma.pitstopEscalation.create({
    data: {
      pitstopId,
      escalatedById: session.user.id,
      escalatedToId,
      note: note?.trim() || null,
    },
    include: {
      escalatedBy: { select: { id: true, name: true, image: true } },
      escalatedTo: { select: { id: true, name: true, image: true } },
    },
  });

  // Notify the escalation target
  await prisma.notification.create({
    data: {
      userId: escalatedToId,
      type: "EscalationAlert",
      title: `Escalation: "${pitstop.title}"`,
      body: note?.trim() || "You have been escalated to on a pitstop.",
      link: `/goals/${pitstop.goalId}/pitstops/${pitstopId}`,
    },
  });
  sendPushToUsers([escalatedToId], {
    title: `Escalation: "${pitstop.title}"`,
    body: note?.trim() || "You have been escalated to on a pitstop.",
    link: `/goals/${pitstop.goalId}/pitstops/${pitstopId}`,
  });

  return Response.json(escalation);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;

  const escalations = await prisma.pitstopEscalation.findMany({
    where: { pitstopId, resolvedAt: null },
    include: {
      escalatedBy: { select: { id: true, name: true, image: true } },
      escalatedTo: { select: { id: true, name: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(escalations);
}
