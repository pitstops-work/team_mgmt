import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateCalendarToken } from "@/lib/calendarToken";
import { buildRbacContext, scopeWhere, getScopeRule, getTeamIds } from "@/lib/rbac";
import EventsCalendar from "./EventsCalendar";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await auth();
  const sp = await searchParams;
  const inviteEventId = sp.invite ?? null;

  // Declares the RSC's surface so surface-restricted grants on pitstop_event
  // (e.g. RP `update` allowed only from activities.list / home.today) resolve
  // to the right scope when computing UI capabilities below.
  const ctx = await buildRbacContext(session, { surface: "activities.list" });
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
      // Hide Cancelled events — they rendered as a struck-through grey row and
      // confused users (esp. after template-sync orphan cleanup created a
      // wave of cancelled rows). Done stays visible (historical record with
      // check mark, not strikethrough); Flagged + InProgress + Rescheduled +
      // Scheduled all stay.
      where: { deletedAt: null, status: { not: "Cancelled" }, ...eventAttendeeFilter },
      include: {
        pitstops: {
          select: {
            pitstop: {
              select: {
                id: true, title: true,
                owner: { select: { id: true, name: true, image: true } },
                goal: {
                  select: {
                    id: true, title: true,
                    // Powers the day-level cluster-split banner in EventsCalendar.
                    needsCluster: { select: { id: true, name: true } },
                  },
                },
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

  // Pulled-to-today history per event — fed into EventCard's "Pulled N×"
  // chip. One groupBy across every event in scope so the JSON serialisation
  // below carries the count without a second client-side fetch.
  if (events.length > 0) {
    const rows = await prisma.auditLog.groupBy({
      by: ["entityId"],
      where: {
        entityType: "Activity",
        action: "add_to_today",
        entityId: { in: events.map(e => e.id) },
      },
      _count: { _all: true },
    });
    const addCountMap = new Map(rows.map(r => [r.entityId, r._count._all]));
    for (const ev of events) {
      const n = addCountMap.get(ev.id);
      if (n) (ev as { addedToTodayCount?: number }).addedToTodayCount = n;
    }
  }

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
    <SurfaceProvider id="activities.list">
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
    </SurfaceProvider>
  );
}
