import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { adminForbidden } from "@/lib/roleGuard";
import ExcelJS from "exceljs";

// GET /api/admin/settlements/export?format=geojson|xlsx
// Exports every Settlement that has a polygon, joined with profile, civic data,
// note, partner, cluster, zone, and city.

type Format = "geojson" | "xlsx";

type Row = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows() {
  return prisma.settlement.findMany({
    where: { deletedAt: null, polygon: { not: null as never } },
    orderBy: [{ city: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      polygon: true,
      centroidLat: true,
      centroidLng: true,
      createdAt: true,
      updatedAt: true,
      cluster: { select: { id: true, name: true, zone: { select: { id: true, name: true } } } },
      city: { select: { id: true, name: true } },
      partner: { select: { id: true, key: true, label: true, color: true, contactName: true, contactPhone: true } },
      profile: {
        select: {
          totalHouseholds: true,
          children6m3yr: true,
          children4to14: true,
          youth15to21: true,
          elderly60plus: true,
          settlementType: true,
          priorityIssues: true,
          addressableCreches: true,
          addressableToilets: true,
          addressableWaterATMs: true,
          lastSyncedAt: true,
        },
      },
      civicData: {
        select: {
          borewell: true,
          toiletConnection: true,
          toiletFacility: true,
          waterSupply: true,
          borewellNeedScore: true,
          toiletConnNeedScore: true,
          toiletFacNeedScore: true,
          waterSupplyNeedScore: true,
          syncedAt: true,
        },
      },
      note: { select: { note: true, updatedAt: true } },
    },
  });
}

function buildGeoJson(rows: Row[]) {
  return {
    type: "FeatureCollection",
    generated: new Date().toISOString(),
    features: rows.map((s) => ({
      type: "Feature",
      geometry: s.polygon as unknown,
      properties: {
        id: s.id,
        name: s.name,
        cityId: s.city?.id ?? null,
        city: s.city?.name ?? null,
        zoneId: s.cluster.zone.id,
        zone: s.cluster.zone.name,
        clusterId: s.cluster.id,
        cluster: s.cluster.name,
        partnerKey: s.partner?.key ?? null,
        partnerLabel: s.partner?.label ?? null,
        partnerColor: s.partner?.color ?? null,
        partnerContact: s.partner?.contactName ?? null,
        partnerPhone: s.partner?.contactPhone ?? null,
        centroidLat: s.centroidLat,
        centroidLng: s.centroidLng,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        profile: s.profile ?? null,
        civicData: s.civicData ?? null,
        note: s.note?.note ?? null,
        noteUpdatedAt: s.note?.updatedAt?.toISOString() ?? null,
      },
    })),
  };
}

// Convert a GeoJSON Polygon/MultiPolygon geometry into a WKT string.
function geometryToWkt(geom: unknown): string {
  if (!geom || typeof geom !== "object") return "";
  const g = geom as { type?: string; coordinates?: unknown };
  const ring = (r: unknown) =>
    Array.isArray(r)
      ? "(" + r.map((pt) => Array.isArray(pt) ? `${pt[0]} ${pt[1]}` : "").join(", ") + ")"
      : "";
  const poly = (p: unknown) =>
    Array.isArray(p) ? "(" + p.map(ring).join(", ") + ")" : "";

  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    return `POLYGON ${poly(g.coordinates)}`;
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    return `MULTIPOLYGON (${g.coordinates.map(poly).join(", ")})`;
  }
  return JSON.stringify(geom);
}

async function buildXlsx(rows: Row[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pitstops";
  wb.created = new Date();

  const ws = wb.addWorksheet("Settlements");
  ws.columns = [
    { header: "ID", key: "id", width: 28 },
    { header: "Name", key: "name", width: 36 },
    { header: "City", key: "city", width: 14 },
    { header: "Zone", key: "zone", width: 18 },
    { header: "Cluster", key: "cluster", width: 22 },
    { header: "Partner", key: "partner", width: 18 },
    { header: "Partner contact", key: "partnerContact", width: 22 },
    { header: "Partner phone", key: "partnerPhone", width: 16 },
    { header: "Centroid lat", key: "lat", width: 12 },
    { header: "Centroid lng", key: "lng", width: 12 },
    { header: "Households", key: "totalHouseholds", width: 12 },
    { header: "Children 6m–3y", key: "children6m3yr", width: 14 },
    { header: "Children 4–14", key: "children4to14", width: 14 },
    { header: "Youth 15–21", key: "youth15to21", width: 12 },
    { header: "Elderly 60+", key: "elderly60plus", width: 12 },
    { header: "Settlement type", key: "settlementType", width: 18 },
    { header: "Priority issues", key: "priorityIssues", width: 30 },
    { header: "Addressable creches", key: "addressableCreches", width: 16 },
    { header: "Addressable toilets", key: "addressableToilets", width: 16 },
    { header: "Addressable water ATMs", key: "addressableWaterATMs", width: 18 },
    { header: "Borewell need score", key: "borewellNeedScore", width: 16 },
    { header: "Toilet connection need score", key: "toiletConnNeedScore", width: 22 },
    { header: "Toilet facility need score", key: "toiletFacNeedScore", width: 22 },
    { header: "Water supply need score", key: "waterSupplyNeedScore", width: 20 },
    { header: "Note", key: "note", width: 40 },
    { header: "Profile synced at", key: "profileSyncedAt", width: 20 },
    { header: "Civic synced at", key: "civicSyncedAt", width: 20 },
    { header: "Created at", key: "createdAt", width: 20 },
    { header: "Updated at", key: "updatedAt", width: 20 },
    { header: "Polygon (WKT)", key: "wkt", width: 60 },
    { header: "Polygon (GeoJSON)", key: "polygonJson", width: 60 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const s of rows) {
    ws.addRow({
      id: s.id,
      name: s.name,
      city: s.city?.name ?? "",
      zone: s.cluster.zone.name,
      cluster: s.cluster.name,
      partner: s.partner?.label ?? "",
      partnerContact: s.partner?.contactName ?? "",
      partnerPhone: s.partner?.contactPhone ?? "",
      lat: s.centroidLat ?? "",
      lng: s.centroidLng ?? "",
      totalHouseholds: s.profile?.totalHouseholds ?? "",
      children6m3yr: s.profile?.children6m3yr ?? "",
      children4to14: s.profile?.children4to14 ?? "",
      youth15to21: s.profile?.youth15to21 ?? "",
      elderly60plus: s.profile?.elderly60plus ?? "",
      settlementType: s.profile?.settlementType ?? "",
      priorityIssues: s.profile?.priorityIssues ?? "",
      addressableCreches: s.profile?.addressableCreches ?? "",
      addressableToilets: s.profile?.addressableToilets ?? "",
      addressableWaterATMs: s.profile?.addressableWaterATMs ?? "",
      borewellNeedScore: s.civicData?.borewellNeedScore ?? "",
      toiletConnNeedScore: s.civicData?.toiletConnNeedScore ?? "",
      toiletFacNeedScore: s.civicData?.toiletFacNeedScore ?? "",
      waterSupplyNeedScore: s.civicData?.waterSupplyNeedScore ?? "",
      note: s.note?.note ?? "",
      profileSyncedAt: s.profile?.lastSyncedAt?.toISOString() ?? "",
      civicSyncedAt: s.civicData?.syncedAt?.toISOString() ?? "",
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      wkt: geometryToWkt(s.polygon),
      polygonJson: JSON.stringify(s.polygon),
    });
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { searchParams } = new URL(req.url);
  const format = (searchParams.get("format") ?? "geojson").toLowerCase() as Format;

  const rows = await loadRows();
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const buf = await buildXlsx(rows);
    return new Response(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="settlements-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const body = JSON.stringify(buildGeoJson(rows));
  return new Response(body, {
    headers: {
      "Content-Type": "application/geo+json",
      "Content-Disposition": `attachment; filename="settlements-${stamp}.geojson"`,
      "Cache-Control": "no-store",
    },
  });
}
