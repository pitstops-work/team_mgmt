import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import GeographyView from "./GeographyView";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function GeographyPage() {
  const session = await auth();

  const [rawCities, rawZones] = await Promise.all([
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
                  orderBy: { name: "asc" },
                },
              },
              orderBy: { name: "asc" },
            },
          },
          orderBy: { name: "asc" },
        },
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
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Geography view expects goals arrays on each level; goals are now on Goal model via direct FK.
  // The geography page is for hierarchy management — pass empty arrays (goal count badges hidden).
  const cities = rawCities.map(c => ({
    ...c, goals: [],
    zones: c.zones.map(z => ({
      ...z, goals: [],
      clusters: z.clusters.map(cl => ({
        ...cl, goals: [],
        settlements: cl.settlements.map(s => ({ ...s, goals: [] })),
      })),
    })),
  }));
  const zones = rawZones.map(z => ({
    ...z, goals: [],
    clusters: z.clusters.map(cl => ({
      ...cl, goals: [],
      settlements: cl.settlements.map(s => ({ ...s, goals: [] })),
    })),
  }));

  return (
    <SurfaceProvider id="geography.view">
      <GeographyView
        initialCities={JSON.parse(JSON.stringify(cities))}
        initialZones={JSON.parse(JSON.stringify(zones))}
        currentUserId={session!.user!.id!}
      />
    </SurfaceProvider>
  );
}
