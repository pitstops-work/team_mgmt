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

// Collect the richest signal each settlement has: polygon perimeter when
// available, otherwise the single centroid point. Centroid-only settlements
// used to be excluded from the hull (the where clause skipped them), which
// meant a new cluster of N centroid-only settlements got no polygon at all.
function pointsForSettlement(s: {
  polygon: unknown; centroidLat: number | null; centroidLng: number | null;
}): [number, number][] {
  const polyPts = extractPoints(s.polygon);
  if (polyPts.length > 0) return polyPts;
  if (s.centroidLat != null && s.centroidLng != null) return [[s.centroidLng, s.centroidLat]];
  return [];
}

// Cluster.geometrySource / Zone.geometrySource is the lock. 'manual' rows
// were hand-drawn (or seeded from the curated geojson files in
// public/data/) and must never be overwritten by the convex-hull
// recompute. Pass { force: true } only when an admin explicitly opts a
// row back into auto mode (e.g. a "reset to auto" button in the
// map-features UI); the call also flips the source to 'auto'.

export async function recomputeClusterBoundary(
  clusterId: string,
  prisma: PrismaClient,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (!opts.force) {
    const row = await prisma.cluster.findUnique({
      where: { id: clusterId },
      select: { geometrySource: true },
    });
    if (row?.geometrySource === "manual") return;
  }
  const settlements = await prisma.settlement.findMany({
    where: { clusterId, deletedAt: null },
    select: { polygon: true, centroidLat: true, centroidLng: true },
  });
  const pts = settlements.flatMap(pointsForSettlement);
  if (pts.length < 3) return;
  const geometry = { type: "Polygon", coordinates: [convexHull(pts)] };
  await prisma.$executeRaw`UPDATE "Cluster" SET geometry = ${JSON.stringify(geometry)}::jsonb, "geometrySource" = 'auto' WHERE id = ${clusterId}`;
}

export async function recomputeZoneBoundary(
  zoneId: string,
  prisma: PrismaClient,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (!opts.force) {
    const row = await prisma.zone.findUnique({
      where: { id: zoneId },
      select: { geometrySource: true },
    });
    if (row?.geometrySource === "manual") return;
  }
  const clusterIds = (await prisma.cluster.findMany({
    where: { zoneId, deletedAt: null },
    select: { id: true },
  })).map(c => c.id);

  const settlements = await prisma.settlement.findMany({
    where: { clusterId: { in: clusterIds }, deletedAt: null },
    select: { polygon: true, centroidLat: true, centroidLng: true },
  });
  const pts = settlements.flatMap(pointsForSettlement);
  if (pts.length < 3) return;
  const geometry = { type: "Polygon", coordinates: [convexHull(pts)] };
  await prisma.$executeRaw`UPDATE "Zone" SET geometry = ${JSON.stringify(geometry)}::jsonb, "geometrySource" = 'auto' WHERE id = ${zoneId}`;
}
