import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { recomputeClusterBoundary, recomputeZoneBoundary } from "@/lib/geo";
import { adminForbidden } from "@/lib/roleGuard";

// GET /api/admin/geography?city=name
// Returns { zones: [{ id, name, clusters: [{ id, name, settlementCount, activeCount }] }] }
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cityName = searchParams.get("city");

  // Find city if scoped
  let cityId: string | undefined;
  if (cityName) {
    const city = await prisma.city.findFirst({
      where: { name: { equals: cityName, mode: "insensitive" }, deletedAt: null },
    });
    if (!city) return Response.json({ error: "City not found" }, { status: 404 });
    cityId = city.id;
  }

  const zones = await prisma.zone.findMany({
    where: {
      deletedAt: null,
      ...(cityId ? { cityId } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      city: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true } },
      clusters: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        include: {
          settlements: {
            orderBy: { name: "asc" },
            select: { id: true, name: true, deletedAt: true },
          },
        },
      },
    },
  });

  // Get all cities for tab display
  const cities = await prisma.city.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const result = zones.map(z => ({
    id: z.id,
    name: z.name,
    cityId: z.cityId,
    cityName: z.city?.name ?? null,
    leadId: z.leadId ?? null,
    leadName: z.lead?.name ?? null,
    clusters: z.clusters.map(c => ({
      id: c.id,
      name: c.name,
      zoneId: c.zoneId,
      settlementCount: c.settlements.length,
      settlements: c.settlements.map(s => ({
        id: s.id,
        name: s.name,
        active: s.deletedAt === null,
        clusterId: c.id,
      })),
    })),
  }));

  return Response.json({ zones: result, cities });
}

// PATCH /api/admin/geography
// body: { type: "cluster",    id, zoneId }          — reassign cluster to zone
//   OR { type: "settlement",  id, active: boolean }  — toggle active/inactive
//   OR { type: "rename-zone", id, name }             — rename zone
//   OR { type: "rename-cluster",    id, name }       — rename cluster
//   OR { type: "rename-settlement", id, name }       — rename settlement
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const body = await req.json();

  if (body.type === "cluster") {
    const { id, zoneId } = body;
    if (!id || !zoneId) return Response.json({ error: "id and zoneId required" }, { status: 400 });
    await prisma.cluster.update({ where: { id }, data: { zoneId } });
    return Response.json({ ok: true });
  }

  if (body.type === "settlement") {
    const { id, active } = body;
    if (!id || active === undefined) return Response.json({ error: "id and active required" }, { status: 400 });
    const s = await prisma.settlement.findUnique({
      where: { id },
      select: { clusterId: true, cluster: { select: { zoneId: true } } },
    });
    await prisma.settlement.update({ where: { id }, data: { deletedAt: active ? null : new Date() } });
    if (s?.clusterId) {
      await recomputeClusterBoundary(s.clusterId, prisma);
      if (s.cluster?.zoneId) await recomputeZoneBoundary(s.cluster.zoneId, prisma);
    }
    return Response.json({ ok: true, boundariesUpdated: true });
  }

  if (body.type === "rename-zone") {
    const { id, name } = body;
    if (!id || !name?.trim()) return Response.json({ error: "id and name required" }, { status: 400 });
    await prisma.zone.update({ where: { id }, data: { name: name.trim() } });
    return Response.json({ ok: true });
  }

  if (body.type === "rename-cluster") {
    const { id, name } = body;
    if (!id || !name?.trim()) return Response.json({ error: "id and name required" }, { status: 400 });
    await prisma.cluster.update({ where: { id }, data: { name: name.trim() } });
    return Response.json({ ok: true });
  }

  if (body.type === "settlement-cluster") {
    const { id, clusterId } = body;
    if (!id || !clusterId) return Response.json({ error: "id and clusterId required" }, { status: 400 });
    const old = await prisma.settlement.findUnique({
      where: { id },
      select: { clusterId: true, cluster: { select: { zoneId: true } } },
    });
    await prisma.settlement.update({ where: { id }, data: { clusterId } });
    const newCluster = await prisma.cluster.findUnique({ where: { id: clusterId }, select: { zoneId: true } });
    const clusterIds = [...new Set([old?.clusterId, clusterId].filter(Boolean))] as string[];
    const zoneIds = [...new Set([old?.cluster?.zoneId, newCluster?.zoneId].filter(Boolean))] as string[];
    await Promise.all([
      ...clusterIds.map(cid => recomputeClusterBoundary(cid, prisma)),
      ...zoneIds.map(zid => recomputeZoneBoundary(zid, prisma)),
    ]);
    return Response.json({ ok: true, boundariesUpdated: true });
  }

  if (body.type === "rename-settlement") {
    const { id, name } = body;
    if (!id || !name?.trim()) return Response.json({ error: "id and name required" }, { status: 400 });
    await prisma.settlement.update({ where: { id }, data: { name: name.trim() } });
    return Response.json({ ok: true });
  }

  if (body.type === "zone-lead") {
    const { id, leadId } = body;
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await prisma.zone.update({ where: { id }, data: { leadId: leadId ?? null } });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Invalid type" }, { status: 400 });
}
