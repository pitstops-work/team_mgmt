import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [zones, clusters] = await Promise.all([
    prisma.zone.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, city: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.cluster.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, zoneId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return Response.json({
    zones: zones.map(z => ({ id: z.id, name: z.name, cityName: z.city?.name ?? null })),
    clusters: clusters.map(c => ({ id: c.id, name: c.name, zoneId: c.zoneId })),
  });
}
