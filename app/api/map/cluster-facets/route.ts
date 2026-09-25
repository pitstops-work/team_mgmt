import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { HEALTH_WORK_KM, MAX_FACILITY_KM, type ClusterFacet, type NearFacility } from "@/lib/clusterQuery";

// GET /api/map/cluster-facets?city=bangalore
//
// One row per cluster with every attribute the Programme Map filters on, so
// the panel can combine filters and show per-option counts client-side
// without another round trip:
//
//   - zone / settlement count
//   - health centres within HEALTH_WORK_KM of any of its settlements
//     (a cluster "has health work" when this list is non-empty)
//   - schools and Indira canteens within MAX_FACILITY_KM of any settlement,
//     each with its nearest distance, so the km slider filters locally
//
// Partner is not returned here: the map's partner layers come from the
// settlement geojson, so the panel derives partner-per-cluster from the same
// source to keep the filter and the drawn polygons in agreement.

interface ClusterRow {
  id: string;
  name: string;
  label: string | null;
  zone: string;
  settlements: number;
}

interface NearRow {
  clusterId: string;
  id: string;
  type: string | null;
  km: number;
}

export async function GET(req: NextRequest) {
  const city = req.nextUrl.searchParams.get("city") ?? "bangalore";
  const cityLike = "%" + city + "%";

  const clusters = await prisma.$queryRaw<ClusterRow[]>`
    SELECT c.id, c.name, c.label, z.name AS zone,
           (SELECT COUNT(*)::int FROM "Settlement" s
             WHERE s."clusterId" = c.id AND s."deletedAt" IS NULL) AS settlements
      FROM "Cluster" c
      JOIN "Zone" z ON z.id = c."zoneId"
      JOIN "City" ci ON ci.id = z."cityId"
     WHERE c."deletedAt" IS NULL AND z."deletedAt" IS NULL
       AND ci.name ILIKE ${cityLike}
     ORDER BY z.name, c.name
  `;
  const ids = clusters.map((c) => c.id);
  if (ids.length === 0) return NextResponse.json({ clusters: [] });

  // Nearest distance from each facility to any settlement in the cluster.
  const [health, schools, bbmpSchools, canteens] = await Promise.all([
    prisma.$queryRaw<NearRow[]>`
      SELECT s."clusterId", l."healthCentreId" AS id, h."centreType" AS type, MIN(l."distanceKm") AS km
        FROM "SettlementHealthCentre" l
        JOIN "Settlement" s ON s.id = l."settlementId" AND s."deletedAt" IS NULL
        JOIN "HealthCentre" h ON h.id = l."healthCentreId"
       WHERE l."distanceKm" <= ${HEALTH_WORK_KM} AND s."clusterId" = ANY(${ids})
       GROUP BY 1, 2, 3
    `,
    prisma.$queryRaw<NearRow[]>`
      SELECT s."clusterId", l."schoolId" AS id, sc."schoolType" AS type, MIN(l."distanceKm") AS km
        FROM "SettlementSchool" l
        JOIN "Settlement" s ON s.id = l."settlementId" AND s."deletedAt" IS NULL
        JOIN "School" sc ON sc.id = l."schoolId"
       WHERE l."distanceKm" <= ${MAX_FACILITY_KM} AND s."clusterId" = ANY(${ids})
       GROUP BY 1, 2, 3
    `,
    prisma.$queryRaw<NearRow[]>`
      SELECT s."clusterId", l."schoolId" AS id, NULL AS type, MIN(l."distanceKm") AS km
        FROM "SettlementBbmpSchool" l
        JOIN "Settlement" s ON s.id = l."settlementId" AND s."deletedAt" IS NULL
        JOIN "BbmpSchool" b ON b.id = l."schoolId"
       WHERE l."distanceKm" <= ${MAX_FACILITY_KM} AND s."clusterId" = ANY(${ids})
         AND b.lat IS NOT NULL AND b.lng IS NOT NULL
       GROUP BY 1, 2
    `,
    prisma.$queryRaw<NearRow[]>`
      SELECT s."clusterId", l."canteenId" AS id, NULL AS type, MIN(l."distanceKm") AS km
        FROM "SettlementCanteen" l
        JOIN "Settlement" s ON s.id = l."settlementId" AND s."deletedAt" IS NULL
       WHERE l."distanceKm" <= ${MAX_FACILITY_KM} AND s."clusterId" = ANY(${ids})
       GROUP BY 1, 2
    `,
  ]);

  const group = (rows: NearRow[], fixedType?: string) => {
    const out = new Map<string, NearFacility[]>();
    for (const r of rows) {
      const list = out.get(r.clusterId) ?? [];
      list.push({ id: r.id, type: fixedType ?? r.type ?? "", km: Math.round(Number(r.km) * 100) / 100 });
      out.set(r.clusterId, list);
    }
    return out;
  };
  const healthBy = group(health);
  const schoolsBy = group(schools);
  const bbmpBy = group(bbmpSchools, "bbmp_udise");
  const canteensBy = group(canteens);

  const result: ClusterFacet[] = clusters.map((c) => ({
    id: c.id,
    name: c.name,
    label: c.label ?? c.name,
    zone: c.zone,
    settlementCount: Number(c.settlements),
    healthCentres: healthBy.get(c.id) ?? [],
    schools: [...(schoolsBy.get(c.id) ?? []), ...(bbmpBy.get(c.id) ?? [])],
    canteens: canteensBy.get(c.id) ?? [],
  }));

  return NextResponse.json({ clusters: result });
}
