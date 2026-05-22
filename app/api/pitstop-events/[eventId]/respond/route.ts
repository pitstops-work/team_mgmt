// Handles attendee responses to activity follow-up notifications.
// action: "yes" | "no" | "cancel" | "reschedule"
// reschedule requires: scheduledAt (and optionally endsAt)

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/auditLog";

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const { action, scheduledAt, endsAt } = await req.json();

  if (!["yes", "no", "cancel", "reschedule"].includes(action)) {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  // Verify user is an attendee
  const attendance = await prisma.pitstopEventAttendee.findUnique({
    where: { eventId_userId: { eventId, userId: session.user.id } },
  });
  if (!attendance) return Response.json({ error: "Not an attendee" }, { status: 403 });

  const followupResponse =
    action === "yes" ? "Done" :
    action === "no"  ? "No" :
    action === "cancel" ? "Cancelled" :
    "Rescheduled";

  // Update per-user followup record
  await prisma.pitstopEventFollowup.upsert({
    where: { eventId_userId: { eventId, userId: session.user.id } },
    create: { eventId, userId: session.user.id, response: followupResponse, sentAt: new Date() },
    update: { response: followupResponse },
  });

  auditLog({
    entityType: "Activity", entityId: eventId, userId: session.user.id,
    action: "responded", field: "response", newValue: followupResponse,
  });

  const actorId = session.user.id;

  if (action === "yes") {
    // Check if ALL attendees have responded Done — if so, mark event Done
    const event = await prisma.pitstopEvent.findUnique({
      where: { id: eventId },
      select: {
        attendees: { select: { userId: true } },
        followups: { select: { userId: true, response: true } },
      },
    });
    if (event) {
      const allResponded = event.attendees.every((a) =>
        event.followups.some((f) => f.userId === a.userId && f.response === "Done")
      );
      if (allResponded) {
        await prisma.pitstopEvent.update({
          where: { id: eventId },
          data: {
            status: "Done",
            completedAt: new Date(),
            completedById: actorId,
            lastUpdatedById: actorId,
          },
        });
      }
    }
    return Response.json({ ok: true, eventStatus: "Done" });
  }

  if (action === "cancel") {
    await prisma.pitstopEvent.update({
      where: { id: eventId },
      data: { status: "Cancelled", lastUpdatedById: actorId },
    });
    return Response.json({ ok: true, eventStatus: "Cancelled" });
  }

  if (action === "reschedule") {
    if (!scheduledAt) return Response.json({ error: "scheduledAt required for reschedule" }, { status: 400 });
    const updated = await prisma.pitstopEvent.update({
      where: { id: eventId },
      data: {
        scheduledAt: new Date(scheduledAt),
        endsAt: endsAt ? new Date(endsAt) : null,
        status: "Scheduled",
        lastUpdatedById: actorId,
      },
    });
    // Clear followup records so the new date gets a fresh follow-up cycle
    await prisma.pitstopEventFollowup.deleteMany({ where: { eventId } });
    return Response.json({ ok: true, event: updated });
  }

  // action === "no" — just record, caller shows cancel/reschedule choice in UI
  return Response.json({ ok: true, next: "choose_cancel_or_reschedule" });
}
