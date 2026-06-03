import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateCalendarToken } from "@/lib/calendarToken";
import { buildRbacContext, scopeWhere, getScopeRule, getTeamIds } from "@/lib/rbac";
import EventsCalendar from "./EventsCalendar";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

// Default initial window around the anchor date the page renders for. ±90d
// covers the day/week/month views the user typically clicks through. Beyond
// that, the client lazy-fetches via /api/pitstop-events/calendar instead of
// shipping the whole table on first paint. Per-user scale 2026-06-04: top
// attendee Hadhi had 646 events with no filter; ±90d cuts that to ~150.
const INITIAL_WINDOW_BEFORE_DAYS = 30;
const INITIAL_WINDOW_AFTER_DAYS  = 90;

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await auth();
  const sp = await searchParams;
  const inviteEventId = sp.invite ?? null;

  // Anchor date — supports deep-links via ?date=YYYY-MM-DD. Falls back to today.
  // The +/- window below is computed off this so URL-shared dates render
  // correctly without the client having to lazy-fetch immediately.
  const anchorDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
    ? new Date(`${sp.date}T12:00:00`)
    : new Date();
  const windowFrom = new Date(anchorDate); windowFrom.setDate(windowFrom.getDate() - INITIAL_WINDOW_BEFORE_DAYS);
  const windowTo   = new Date(anchorDate); windowTo.setDate(windowTo.getDate() + INITIAL_WINDOW_AFTER_DAYS);
  windowFrom.setHours(0, 0, 0, 0);
  windowTo.setHours(23, 59, 59, 999);

  // Declares the RSC's surface so surface-restricted grants on pitstop_event
  // (e.g. RP `update` allowed only from activities.list / home.today) resolve
  // to the right scope when computing UI capabilities below.
  const ctx = await buildRbacContext(session, { surface: "activities.list" });
  const eventScope = ctx ? await scopeWhere(ctx, "pitstop_event", "list") : null;
  const eventAttendeeFilter: Record<string, unknown> = eventScope ?? {};
  // pitstopScope removed alongside the eager pitstops query — /api/pitstops/lite
  // computes the same scope on demand when AddActivityModal opens.

  // Who can this user mark done on behalf of others? Mirror the RBAC
  // pitstop_event.update scope (super-admin/admin = "all", leaders = "team")
  // so the completion button isn't limited to the user's own activities.
  const eventUpdateRule = ctx ? await getScopeRule(ctx, "pitstop_event", "update") : null;
  const eventUpdateScope = eventUpdateRule?.kind ?? "own";
  const manageableTeamIds = ctx && eventUpdateScope === "team" ? await getTeamIds(ctx.userId) : [];

  // All users shown in attendee picker — anyone can invite anyone
  const userFilter = {};

  // Pitstops dropped from this Promise.all — for Leaders/admins it was the
  // 2nd-heaviest query (thousands of rows × goal include). Lazy-loaded by
  // EventsCalendar on AddActivityModal first open via /api/pitstops/lite.
  const [events, users, rawZones, rawClusters, goalGeo] = await Promise.all([
    prisma.pitstopEvent.findMany({
      // Hide Cancelled events — they rendered as a struck-through grey row and
      // confused users (esp. after template-sync orphan cleanup created a
      // wave of cancelled rows). Done stays visible (historical record with
      // check mark, not strikethrough); Flagged + InProgress + Rescheduled +
      // Scheduled all stay.
      // ±90d window around anchorDate keeps initial-paint event count bounded
      // (was unbounded → top attendees got 600+ rows per load). Out-of-window
      // navigation lazy-fetches via /api/pitstop-events/calendar.
      where: {
        deletedAt: null,
        status: { not: "Cancelled" },
        scheduledAt: { gte: windowFrom, lte: windowTo },
        ...eventAttendeeFilter,
      },
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
    // pitstops query removed — lazy-loaded by EventsCalendar via /api/pitstops/lite on first AddActivityModal open
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
        users={JSON.parse(JSON.stringify(users))}
        currentUserId={session!.user!.id!}
        eventUpdateScope={eventUpdateScope}
        manageableTeamIds={manageableTeamIds}
        zones={JSON.parse(JSON.stringify(zones))}
        clusters={JSON.parse(JSON.stringify(clusters))}
        calendarToken={calendarToken}
        inviteEventId={inviteEventId}
        windowFromYmd={toYMD(windowFrom)}
        windowToYmd={toYMD(windowTo)}
      />
    </SurfaceProvider>
  );
}
