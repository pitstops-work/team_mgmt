import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import EventsCalendar from "./EventsCalendar";

export default async function EventsPage() {
  const session = await auth();

  const [events, pitstops] = await Promise.all([
    prisma.pitstopEvent.findMany({
      where: { deletedAt: null },
      include: {
        pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
        createdBy: { select: { id: true, name: true, image: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.pitstop.findMany({
      where: { deletedAt: null, goal: { deletedAt: null } },
      select: {
        id: true,
        title: true,
        goal: { select: { id: true, title: true } },
      },
      orderBy: [{ goal: { title: "asc" } }, { order: "asc" }],
    }),
  ]);

  return (
    <EventsCalendar
      events={JSON.parse(JSON.stringify(events))}
      pitstops={JSON.parse(JSON.stringify(pitstops))}
      currentUserId={session!.user!.id!}
    />
  );
}
