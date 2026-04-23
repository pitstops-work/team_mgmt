import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const { action } = await req.json();

  if (action !== "accept" && action !== "decline") {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  const attendee = await prisma.pitstopEventAttendee.findUnique({
    where: { eventId_userId: { eventId, userId: session.user.id } },
  });
  if (!attendee) return Response.json({ error: "No invite found" }, { status: 404 });

  await prisma.pitstopEventAttendee.update({
    where: { eventId_userId: { eventId, userId: session.user.id } },
    data: { status: action === "accept" ? "accepted" : "declined" },
  });

  if (action === "decline") {
    const event = await prisma.pitstopEvent.findUnique({
      where: { id: eventId },
      select: { title: true, createdById: true },
    });
    if (event?.createdById && event.createdById !== session.user.id) {
      const declinerName = session.user.name ?? "Someone";
      await prisma.notification.create({
        data: {
          userId: event.createdById,
          type: "ActivityTagged",
          title: `${declinerName} declined your invite to "${event.title}"`,
          body: null,
          link: `/activities`,
        },
      });
    }
  }

  return Response.json({ ok: true, status: action === "accept" ? "accepted" : "declined" });
}
