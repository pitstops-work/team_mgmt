import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/map/health-clusters
// Returns { clusterName: isHealthCluster } map for all Bangalore clusters.
export async function GET() {
  const clusters = await prisma.cluster.findMany({
    where: { deletedAt: null },
    select: { name: true, isHealthCluster: true },
  });
  const result: Record<string, boolean> = {};
  for (const c of clusters) result[c.name] = c.isHealthCluster;
  return NextResponse.json(result);
}
