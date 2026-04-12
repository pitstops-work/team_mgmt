import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const features = await prisma.mapFeature.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(features);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, cluster, zone, partner, description, type, lat, lng } = body;

  if (!name?.trim() || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const feature = await prisma.mapFeature.create({
    data: {
      name: String(name).trim(),
      cluster: String(cluster ?? "").trim(),
      zone: String(zone ?? "").trim(),
      partner: String(partner ?? "").trim(),
      description: String(description ?? "").trim(),
      type: String(type ?? "other").trim(),
      lat: Number(lat),
      lng: Number(lng),
    },
  });

  return NextResponse.json(feature, { status: 201 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.mapFeature.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
