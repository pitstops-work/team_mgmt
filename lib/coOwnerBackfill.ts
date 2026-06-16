import prisma from "./prisma";

/**
 * After a co-owner lands on a goal or pitstop, add them as an attendee on
 * every not-yet-Done event under that scope. Matches the create-time policy:
 * goal/pitstop co-owners ride along on every event so it surfaces on their
 * calendar without manual tagging.
 *
 * Idempotent — existing attendees are skipped via the NOT filter + the
 * composite-key duplicate guard. Status is "accepted" (calendar surfacing
 * is the point, no confirmation step needed).
 */
export async function backfillEventAttendeeForCoOwner(
  userId: string,
  scope: { goalId: string } | { pitstopId: string },
): Promise<number> {
  const pitstopWhere = "goalId" in scope
    ? { goalId: scope.goalId, deletedAt: null }
    : { id: scope.pitstopId, deletedAt: null };

  const events = await prisma.pitstopEvent.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["Done", "Cancelled"] },
      pitstops: { some: { pitstop: pitstopWhere } },
      NOT: { attendees: { some: { userId } } },
    },
    select: { id: true },
  });
  if (events.length === 0) return 0;
  await prisma.pitstopEventAttendee.createMany({
    data: events.map((e) => ({ eventId: e.id, userId, status: "accepted" })),
    skipDuplicates: true,
  });
  return events.length;
}
