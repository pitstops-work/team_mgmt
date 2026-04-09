import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import EventsCalendar from "./EventsCalendar";

export default async function ActivitiesPage() {
  const session = await auth();

  const [events, pitstops, users] = await Promise.all([
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
  ]);

  return (
    <EventsCalendar
      events={JSON.parse(JSON.stringify(events))}
      pitstops={JSON.parse(JSON.stringify(pitstops))}
      users={JSON.parse(JSON.stringify(users))}
      currentUserId={session!.user!.id!}
    />
  );
}
