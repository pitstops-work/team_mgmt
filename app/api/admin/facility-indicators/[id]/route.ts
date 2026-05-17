import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const {
    key, label, description, domain, facilityLayerKey, schemeId,
    unit, frequency, color, targetFormula,
    captureSource, misProviderId, misFetchConfig,
    staleYellowDays, staleRedDays, sortOrder, isActive,
  } = body;

  if (!key || !label || !domain || !captureSource) {
    return Response.json({ error: "key, label, domain, captureSource required" }, { status: 400 });
  }

  await prisma.$executeRaw`
    UPDATE "FacilityIndicatorDef"
    SET key = ${key}, label = ${label}, description = ${description ?? null},
        domain = ${domain}, "facilityLayerKey" = ${facilityLayerKey ?? null},
        "schemeId" = ${schemeId ?? null},
        unit = ${unit ?? null}, frequency = ${(frequency ?? "Monthly")}::"MetricFrequency",
        color = ${color ?? "#6366f1"},
        "targetFormula" = ${targetFormula ? JSON.stringify(targetFormula) : null}::jsonb,
        "captureSource" = ${captureSource}::"FacilityIndicatorSource",
        "misProviderId" = ${misProviderId ?? null},
        "misFetchConfig" = ${misFetchConfig ? JSON.stringify(misFetchConfig) : null}::jsonb,
        "staleYellowDays" = ${staleYellowDays ?? 45},
        "staleRedDays" = ${staleRedDays ?? 90},
        "sortOrder" = ${sortOrder ?? 0},
        "isActive" = ${isActive !== false},
        "updatedAt" = NOW()
    WHERE id = ${id}
  `;

  return Response.json({ id, ...body });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.$executeRaw`
    UPDATE "FacilityIndicatorDef" SET "isActive" = false, "updatedAt" = NOW() WHERE id = ${id}
  `;
  return Response.json({ ok: true });
}
