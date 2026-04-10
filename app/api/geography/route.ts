import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [cities, zones, clusters, settlements] = await Promise.all([
    prisma.city.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.zone.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.cluster.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.settlement.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);

  return Response.json({ cities, zones, clusters, settlements });
}
