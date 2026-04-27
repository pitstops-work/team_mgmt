import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [cities, zones, clusters] = await Promise.all([
    prisma.city.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.zone.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, cityId: true, city: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.cluster.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, zoneId: true,
        _count: { select: { settlements: { where: { deletedAt: null } } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return Response.json({
    cities: cities.map(c => ({ id: c.id, name: c.name })),
    zones: zones.map(z => ({ id: z.id, name: z.name, cityId: z.cityId ?? null, cityName: z.city?.name ?? null })),
    clusters: clusters.map(c => ({ id: c.id, name: c.name, zoneId: c.zoneId, settlementCount: c._count.settlements })),
  });
}
