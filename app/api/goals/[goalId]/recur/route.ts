import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { randomUUID } from "crypto";

const RECURRENCE_DAYS: Record<string, number> = {
  Weekly: 7,
  Monthly: 30,
  Quarterly: 91,
  Yearly: 365,
};

function shiftDate(date: Date | null, ms: number): Date | null {
  return date ? new Date(date.getTime() + ms) : null;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      pitstops: {
        where: { deletedAt: null },
        include: {
          checklistItems: { orderBy: { order: "asc" } },
          events: {
            include: {
              event: {
                include: { attendees: true },
              },
            },
          },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!goal) return Response.json({ error: "Not found" }, { status: 404 });
  if (!goal.recurrence || goal.recurrence === "None")
    return Response.json({ error: "Goal has no recurrence set" }, { status: 400 });

  const days = RECURRENCE_DAYS[goal.recurrence];
  const shiftMs = days * 86400000;

  const newTargetDate = goal.targetDate
    ? new Date(goal.targetDate.getTime() + shiftMs)
    : new Date(Date.now() + shiftMs);

  // Create next goal instance
  const newGoal = await prisma.goal.create({
    data: {
      title: goal.title,
      description: goal.description,
      status: "Active",
      recurrence: goal.recurrence,
      ownerId: goal.ownerId,
      targetDate: newTargetDate,
      needsDomain: goal.needsDomain,
      needsSettlementId: goal.needsSettlementId,
      needsClusterId: goal.needsClusterId,
      needsZoneId: goal.needsZoneId,
      needsCityId: goal.needsCityId,
    },
  });

  // Auto-follow for owner
  await prisma.goalFollow.upsert({
    where: { userId_goalId: { userId: goal.ownerId, goalId: newGoal.id } },
    create: { userId: goal.ownerId, goalId: newGoal.id },
    update: {},
  });

  // Clone pitstops with checklists and activities
  for (const p of goal.pitstops) {
    const newPitstop = await prisma.pitstop.create({
      data: {
        title: p.title,
        type: p.type,
        notes: p.notes,
        status: "Upcoming",
        goalId: newGoal.id,
        ownerId: p.ownerId,
        ownerInherited: p.ownerInherited,
        order: p.order,
        progressTag: p.progressTag,
        startDate: shiftDate(p.startDate, shiftMs),
        targetDate: shiftDate(p.targetDate, shiftMs),
      },
    });

    // Clone checklist items — build old-id → new-id map for activity remapping
    const checklistIdMap = new Map<string, string>();
    if (p.checklistItems.length > 0) {
      for (const item of p.checklistItems) {
        const newItem = await prisma.checklistItem.create({
          data: {
            pitstopId: newPitstop.id,
            text: item.text,
            checked: false,
            order: item.order,
          },
        });
        checklistIdMap.set(item.id, newItem.id);
      }
    }

    // Clone activities (PitstopEvents) linked to this pitstop
    for (const junction of p.events) {
      const ev = junction.event;
      const newEventId = randomUUID();
      const newScheduledAt = new Date(ev.scheduledAt.getTime() + shiftMs);
      await prisma.pitstopEvent.create({
        data: {
          id: newEventId,
          title: ev.title,
          description: ev.description,
          type: ev.type,
          status: "Scheduled",
          scheduledAt: newScheduledAt,
          originalScheduledAt: newScheduledAt,
          endsAt: ev.endsAt ? new Date(ev.endsAt.getTime() + shiftMs) : null,
          location: ev.location,
          createdById: ev.createdById,
          // Remap checklist link to the cloned item
          checklistItemId: ev.checklistItemId
            ? (checklistIdMap.get(ev.checklistItemId) ?? null)
            : null,
        },
      });

      // Link new event to new pitstop
      await prisma.pitstopEventPitstop.create({
        data: { eventId: newEventId, pitstopId: newPitstop.id },
      });

      // Copy attendees
      if (ev.attendees.length > 0) {
        await prisma.pitstopEventAttendee.createMany({
          data: ev.attendees.map((a) => ({
            eventId: newEventId,
            userId: a.userId,
            status: "pending",
          })),
          skipDuplicates: true,
        });
      }
    }
  }

  return Response.json({ goalId: newGoal.id }, { status: 201 });
}
