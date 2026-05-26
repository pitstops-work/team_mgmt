import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateCalendarToken } from "@/lib/calendarToken";
import { buildRbacContext, scopeWhere, getScopeRule, getTeamIds } from "@/lib/rbac";
import EventsCalendar from "./EventsCalendar";

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await auth();
  const sp = await searchParams;
  const inviteEventId = sp.invite ?? null;

  const ctx = await buildRbacContext(session);
  const eventScope = ctx ? await scopeWhere(ctx, "pitstop_event", "list") : null;
  const pitstopScope = ctx ? await scopeWhere(ctx, "pitstop", "list") : null;
  const eventAttendeeFilter: Record<string, unknown> = eventScope ?? {};
  const pitstopOwnerFilter: Record<string, unknown> = pitstopScope ?? {};

  // Who can this user mark done on behalf of others? Mirror the RBAC
  // pitstop_event.update scope (super-admin/admin = "all", leaders = "team")
  // so the completion button isn't limited to the user's own activities.
  const eventUpdateRule = ctx ? await getScopeRule(ctx, "pitstop_event", "update") : null;
  const eventUpdateScope = eventUpdateRule?.kind ?? "own";
  const manageableTeamIds = ctx && eventUpdateScope === "team" ? await getTeamIds(ctx.userId) : [];

  // All users shown in attendee picker — anyone can invite anyone
  const userFilter = {};

  const [events, pitstops, users, rawZones, rawClusters, goalGeo] = await Promise.all([
    prisma.pitstopEvent.findMany({
      where: { deletedAt: null, ...eventAttendeeFilter },
      include: {
        pitstops: {
          select: {
            pitstop: {
              select: {
                id: true, title: true,
                owner: { select: { id: true, name: true, image: true } },
                goal: { select: { id: true, title: true } },
              },
            },
          },
        },
        createdBy: { select: { id: true, name: true, image: true } },
        attendees: { select: { id: true, userId: true, status: true, user: { select: { id: true, name: true, image: true } } } },
        checklistItem: { select: { id: true, completionType: true, text: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.pitstop.findMany({
      where: { deletedAt: null, goal: { deletedAt: null }, ...pitstopOwnerFilter },
      select: {
        id: true,
        title: true,
        owner: { select: { id: true, name: true, image: true } },
        goal: { select: { id: true, title: true } },
      },
      orderBy: [{ goal: { title: "asc" } }, { order: "asc" }],
    }),
    prisma.user.findMany({
      where: userFilter,
      select: { id: true, name: true, image: true },
      orderBy: { name: "asc" },
    }),
    prisma.zone.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.cluster.findMany({
      select: { id: true, name: true, zone: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.goal.findMany({
      where: { deletedAt: null },
      select: { id: true, needsZoneId: true, needsClusterId: true },
    }),
  ]);

  // Build the same { goals: { goalId }[] } shape EventsCalendar expects,
  // now derived from direct FK fields instead of the removed M2M tables.
  const zones = rawZones.map(z => ({
    ...z,
    goals: goalGeo.filter(g => g.needsZoneId === z.id).map(g => ({ goalId: g.id })),
  }));
  const clusters = rawClusters.map(c => ({
    ...c,
    goals: goalGeo.filter(g => g.needsClusterId === c.id).map(g => ({ goalId: g.id })),
  }));

  const calendarToken = session?.user?.id ? generateCalendarToken(session.user.id) : null;

  return (
    <EventsCalendar
      events={JSON.parse(JSON.stringify(events))}
      pitstops={JSON.parse(JSON.stringify(pitstops))}
      users={JSON.parse(JSON.stringify(users))}
      currentUserId={session!.user!.id!}
      eventUpdateScope={eventUpdateScope}
      manageableTeamIds={manageableTeamIds}
      zones={JSON.parse(JSON.stringify(zones))}
      clusters={JSON.parse(JSON.stringify(clusters))}
      calendarToken={calendarToken}
      inviteEventId={inviteEventId}
    />
  );
}
