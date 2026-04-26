import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import RoutePlannerLoader from "./RoutePlannerLoader";

export const metadata = { title: "Route Planner · Urban Program" };

export type SettlementStop = {
  id: string;
  name: string;
  clusterName: string;
  zoneName: string;
  lat: number;
  lng: number;
  health: "red" | "amber" | "green" | "grey";
  overdueCount: number;
  dueSoonCount: number;
  totalOpen: number;
};

export default async function RoutePlannerPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const rows = await prisma.$queryRaw<{
    id: string;
    name: string;
    cluster_name: string;
    zone_name: string;
    centroid_lat: number;
    centroid_lng: number;
    overdue_count: bigint;
    due_soon_count: bigint;
    total_open: bigint;
  }[]>`
    SELECT
      s.id,
      s.name,
      c.name AS cluster_name,
      z.name AS zone_name,
      s."centroidLat" AS centroid_lat,
      s."centroidLng" AS centroid_lng,
      COALESCE(ph.overdue_count, 0) AS overdue_count,
      COALESCE(ph.due_soon_count, 0) AS due_soon_count,
      COALESCE(ph.total_open, 0) AS total_open
    FROM "Settlement" s
    JOIN "Cluster" c ON c.id = s."clusterId" AND c."deletedAt" IS NULL
    JOIN "Zone" z ON z.id = c."zoneId" AND z."deletedAt" IS NULL
    LEFT JOIN (
      SELECT
        "needsSettlementId",
        COUNT(*) FILTER (WHERE "targetDate" < NOW() AND status::text IN ('Upcoming', 'InProgress')) AS overdue_count,
        COUNT(*) FILTER (WHERE "targetDate" >= NOW() AND "targetDate" <= NOW() + INTERVAL '7 days' AND status::text IN ('Upcoming', 'InProgress')) AS due_soon_count,
        COUNT(*) FILTER (WHERE status::text IN ('Upcoming', 'InProgress')) AS total_open
      FROM "Pitstop"
      WHERE "deletedAt" IS NULL AND "needsSettlementId" IS NOT NULL
      GROUP BY "needsSettlementId"
    ) ph ON ph."needsSettlementId" = s.id
    WHERE s."deletedAt" IS NULL
      AND s."centroidLat" IS NOT NULL
      AND s."centroidLng" IS NOT NULL
    ORDER BY z.name, c.name, s.name
  `;

  const stops: SettlementStop[] = rows.map((r) => {
    const overdueCount = Number(r.overdue_count);
    const dueSoonCount = Number(r.due_soon_count);
    const totalOpen = Number(r.total_open);
    let health: SettlementStop["health"] = "grey";
    if (overdueCount > 0) health = "red";
    else if (dueSoonCount > 0) health = "amber";
    else if (totalOpen > 0) health = "green";

    return {
      id: r.id,
      name: r.name,
      clusterName: r.cluster_name,
      zoneName: r.zone_name,
      lat: r.centroid_lat,
      lng: r.centroid_lng,
      health,
      overdueCount,
      dueSoonCount,
      totalOpen,
    };
  });

  return (
    <div className="absolute inset-0">
      <RoutePlannerLoader stops={stops} />
    </div>
  );
}
