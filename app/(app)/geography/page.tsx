import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import GeographyView from "./GeographyView";

export default async function GeographyPage() {
  const session = await auth();

  const [zones, clusters, settlements] = await Promise.all([
    prisma.zone.findMany({
      where: { deletedAt: null },
      include: {
        clusters: {
          where: { deletedAt: null },
          include: {
            settlements: { where: { deletedAt: null }, orderBy: { name: "asc" } },
          },
          orderBy: { name: "asc" },
        },
        goals: { include: { goal: { where: { deletedAt: null }, select: { id: true, title: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.cluster.findMany({
      where: { deletedAt: null },
      include: { goals: { include: { goal: { where: { deletedAt: null }, select: { id: true, title: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.settlement.findMany({
      where: { deletedAt: null },
      include: { goals: { include: { goal: { where: { deletedAt: null }, select: { id: true, title: true } } } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <GeographyView
      initialZones={JSON.parse(JSON.stringify(zones))}
      initialClusters={JSON.parse(JSON.stringify(clusters))}
      initialSettlements={JSON.parse(JSON.stringify(settlements))}
      currentUserId={session!.user!.id!}
    />
  );
}
