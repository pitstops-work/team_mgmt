import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import CalendarView from "./CalendarView";

export default async function CalendarPage() {
  await auth();

  const [pitstops, scheduledEvents] = await Promise.all([
    prisma.pitstop.findMany({
      where: {
        deletedAt: null,
        goal: { deletedAt: null },
        OR: [{ startDate: { not: null } }, { targetDate: { not: null } }],
      },
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        customType: true,
        startDate: true,
        targetDate: true,
        goal: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true, image: true } },
      },
      orderBy: { targetDate: "asc" },
    }),
    prisma.pitstopEvent.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        title: true,
        type: true,
        scheduledAt: true,
        pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  return (
    <CalendarView
      pitstops={JSON.parse(JSON.stringify(pitstops))}
      scheduledEvents={JSON.parse(JSON.stringify(scheduledEvents))}
    />
  );
}
