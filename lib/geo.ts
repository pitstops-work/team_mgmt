import { PrismaClient } from "@/app/generated/prisma/client";

// Andrew's monotone chain convex hull — returns closed GeoJSON ring [[lng,lat],...,[lng,lat]]
export function convexHull(pts: [number, number][]): [number, number][] {
  const unique = Array.from(new Map(pts.map(p => [`${p[0]},${p[1]}`, p])).values());
  const n = unique.length;
  if (n < 3) return unique.length ? [...unique, unique[0]] : [];

  const sorted = [...unique].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const cross = (O: [number, number], A: [number, number], B: [number, number]) =>
    (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);

  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper] as [number, number][];
  hull.push(hull[0]);
  return hull;
}

function extractPoints(geometry: unknown): [number, number][] {
  if (!geometry || typeof geometry !== "object") return [];
  const g = geometry as { type: string; coordinates: unknown };
  if (g.type === "Polygon") {
    return ((g.coordinates as number[][][])[0] ?? []) as [number, number][];
  }
  if (g.type === "MultiPolygon") {
    return (g.coordinates as number[][][][]).flatMap(p => p[0] ?? []) as [number, number][];
  }
  return [];
}

export async function recomputeClusterBoundary(clusterId: string, prisma: PrismaClient): Promise<void> {
  const settlements = await prisma.settlement.findMany({
    where: { clusterId, deletedAt: null, polygon: { not: undefined } },
    select: { polygon: true },
  });
  const pts = settlements.flatMap(s => extractPoints(s.polygon));
  if (pts.length < 3) return;
  const geometry = { type: "Polygon", coordinates: [convexHull(pts)] };
  await prisma.$executeRaw`UPDATE "Cluster" SET geometry = ${JSON.stringify(geometry)}::jsonb WHERE id = ${clusterId}`;
}

export async function recomputeZoneBoundary(zoneId: string, prisma: PrismaClient): Promise<void> {
  const clusterIds = (await prisma.cluster.findMany({
    where: { zoneId, deletedAt: null },
    select: { id: true },
  })).map(c => c.id);

  const settlements = await prisma.settlement.findMany({
    where: { clusterId: { in: clusterIds }, deletedAt: null, polygon: { not: undefined } },
    select: { polygon: true },
  });
  const pts = settlements.flatMap(s => extractPoints(s.polygon));
  if (pts.length < 3) return;
  const geometry = { type: "Polygon", coordinates: [convexHull(pts)] };
  await prisma.$executeRaw`UPDATE "Zone" SET geometry = ${JSON.stringify(geometry)}::jsonb WHERE id = ${zoneId}`;
}
