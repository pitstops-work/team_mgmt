import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import CalendarView from "./CalendarView";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function TimelinePage() {
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
      where: { deletedAt: null, status: { not: "Cancelled" } }, // hide struck-through cancelled rows from the timeline
      select: {
        id: true,
        title: true,
        type: true,
        scheduledAt: true,
        pitstops: { select: { pitstop: { select: { id: true, title: true, goal: { select: { id: true, title: true } } } } } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
  ]);

  return (
    <SurfaceProvider id="timeline.view">
      <CalendarView
        pitstops={JSON.parse(JSON.stringify(pitstops))}
        scheduledEvents={JSON.parse(JSON.stringify(scheduledEvents))}
      />
    </SurfaceProvider>
  );
}
