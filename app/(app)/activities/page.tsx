import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateCalendarToken } from "@/lib/calendarToken";
import { buildRbacContext, scopeWhere } from "@/lib/rbac";
import EventsCalendar from "./EventsCalendar";

const USE_RBAC = process.env.USE_RBAC === "1";

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await auth();
  const sp = await searchParams;
  const inviteEventId = sp.invite ?? null;
  const userId = session!.user!.id!;

  let eventAttendeeFilter: Record<string, unknown>;
  let pitstopOwnerFilter: Record<string, unknown>;

  if (USE_RBAC) {
    const ctx = await buildRbacContext(session);
    const eventScope = ctx ? await scopeWhere(ctx, "pitstop_event", "list") : null;
    const pitstopScope = ctx ? await scopeWhere(ctx, "pitstop", "list") : null;
    eventAttendeeFilter = eventScope ?? {};
    pitstopOwnerFilter = pitstopScope ?? {};
  } else {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { designation: true },
    });
    const designation = me?.designation ?? "Other";

    // Scope events: RP sees own, ZL sees team, PM sees ZLs + their RPs, others see all.
    // KNOWN GAP (fixed via RBAC path): Leader and Other see all here — see catalog sweep checklist.
    let teamIds: string[] = [userId];
    if (designation === "ZL") {
      const team = await prisma.user.findMany({ where: { reportsToId: userId }, select: { id: true } });
      teamIds = [userId, ...team.map(m => m.id)];
    } else if (designation === "PM") {
      const zls = await prisma.user.findMany({ where: { reportsToId: userId }, select: { id: true } });
      const zlIds = zls.map(z => z.id);
      const rps = zlIds.length > 0
        ? await prisma.user.findMany({ where: { reportsToId: { in: zlIds } }, select: { id: true } })
        : [];
      teamIds = [userId, ...zlIds, ...rps.map(r => r.id)];
    }

    const isScoped = designation === "RP" || designation === "ZL" || designation === "PM";
    eventAttendeeFilter = isScoped
      ? { attendees: { some: { userId: { in: teamIds } } } }
      : {};
    // Co-owners of a pitstop are treated as owners for visibility.
    pitstopOwnerFilter = isScoped
      ? {
          OR: [
            { ownerId: { in: teamIds } },
            { coOwners: { some: { userId: { in: teamIds } } } },
          ],
        }
      : {};
  }

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
      zones={JSON.parse(JSON.stringify(zones))}
      clusters={JSON.parse(JSON.stringify(clusters))}
      calendarToken={calendarToken}
      inviteEventId={inviteEventId}
    />
  );
}
