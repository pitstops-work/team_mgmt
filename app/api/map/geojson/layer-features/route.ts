import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/map/geojson/layer-features?layerKey=creches&city=bangalore
// Returns a GeoJSON FeatureCollection of programme centre points from the DB.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const layerKey = searchParams.get("layerKey");

  const rows = await prisma.layerFeature.findMany({
    where: {
      ...(layerKey ? { layerKey } : {}),
    },
    select: {
      id: true,
      name: true,
      layerKey: true,
      centreType: true,
      partner: true,
      lat: true,
      lng: true,
      notes: true,
      settlement: { select: { id: true, name: true } },
      cluster: { select: { id: true, name: true } },
      zone: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const features = rows.map((f) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [f.lng, f.lat] },
    properties: {
      id: f.id,
      name: f.name,
      layer_key: f.layerKey,
      centre_type: f.centreType ?? f.layerKey.replace(/_/g, " "),
      partner: f.partner ?? "",
      zone: f.zone?.name ?? "",
      cluster: f.cluster?.name ?? "",
      matched_settlement: f.settlement?.name ?? "",
      settlement_id: f.settlement?.id ?? "",
      note: f.notes ?? "",
      description: f.notes ?? "",
    },
  }));

  return NextResponse.json(
    { type: "FeatureCollection", features },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } }
  );
}
