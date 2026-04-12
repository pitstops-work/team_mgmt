import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateCalendarToken } from "@/lib/calendarToken";
import EventsCalendar from "./EventsCalendar";

export default async function ActivitiesPage() {
  const session = await auth();

  const [events, pitstops, users, zones, clusters] = await Promise.all([
    prisma.pitstopEvent.findMany({
      where: { deletedAt: null },
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
        attendees: { select: { id: true, userId: true, user: { select: { id: true, name: true, image: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.pitstop.findMany({
      where: { deletedAt: null, goal: { deletedAt: null } },
      select: {
        id: true,
        title: true,
        owner: { select: { id: true, name: true, image: true } },
        goal: { select: { id: true, title: true } },
      },
      orderBy: [{ goal: { title: "asc" } }, { order: "asc" }],
    }),
    prisma.user.findMany({
      select: { id: true, name: true, image: true },
      orderBy: { name: "asc" },
    }),
    prisma.zone.findMany({
      select: {
        id: true, name: true,
        goals: { select: { goalId: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.cluster.findMany({
      select: {
        id: true, name: true,
        zone: { select: { name: true } },
        goals: { select: { goalId: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

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
    />
  );
}
