import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import GeographyView from "./GeographyView";

export default async function GeographyPage() {
  const session = await auth();

  const [cities, zones] = await Promise.all([
    prisma.city.findMany({
      where: { deletedAt: null },
      include: {
        zones: {
          where: { deletedAt: null },
          include: {
            clusters: {
              where: { deletedAt: null },
              include: {
                settlements: {
                  where: { deletedAt: null },
                  include: { goals: { include: { goal: { select: { id: true, title: true } } } } },
                  orderBy: { name: "asc" },
                },
                goals: { include: { goal: { select: { id: true, title: true } } } },
              },
              orderBy: { name: "asc" },
            },
            goals: { include: { goal: { select: { id: true, title: true } } } },
          },
          orderBy: { name: "asc" },
        },
        goals: { include: { goal: { select: { id: true, title: true } } } },
      },
      orderBy: { name: "asc" },
    }),

    // Zones not yet assigned to a city
    prisma.zone.findMany({
      where: { deletedAt: null, cityId: null },
      include: {
        clusters: {
          where: { deletedAt: null },
          include: {
            settlements: { where: { deletedAt: null }, orderBy: { name: "asc" } },
          },
          orderBy: { name: "asc" },
        },
        goals: { include: { goal: { select: { id: true, title: true } } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <GeographyView
      initialCities={JSON.parse(JSON.stringify(cities))}
      initialZones={JSON.parse(JSON.stringify(zones))}
      currentUserId={session!.user!.id!}
    />
  );
}
