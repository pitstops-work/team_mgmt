import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";
import { randomUUID } from "crypto";

type IndicatorRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  domain: string;
  facilityLayerKey: string | null;
  schemeId: string | null;
  unit: string | null;
  frequency: string;
  color: string;
  targetFormula: unknown;
  captureSource: string;
  misProviderId: string | null;
  misFetchConfig: unknown;
  staleYellowDays: number;
  staleRedDays: number;
  sortOrder: number;
  isActive: boolean;
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("all") === "1";

  const rows = await prisma.$queryRawUnsafe<IndicatorRow[]>(
    `SELECT id, key, label, description, domain, "facilityLayerKey", "schemeId",
            unit, frequency::text AS frequency, color, "targetFormula",
            "captureSource"::text AS "captureSource", "misProviderId", "misFetchConfig",
            "staleYellowDays", "staleRedDays", "sortOrder", "isActive"
     FROM "FacilityIndicatorDef"
     ${includeInactive ? "" : `WHERE "isActive" = true`}
     ORDER BY "sortOrder" ASC, label ASC`
  );

  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const {
    key, label, description, domain, facilityLayerKey, schemeId,
    unit, frequency, color, targetFormula,
    captureSource, misProviderId, misFetchConfig,
    staleYellowDays, staleRedDays, sortOrder,
  } = body;

  if (!key || !label || !domain || !captureSource) {
    return Response.json({ error: "key, label, domain, captureSource required" }, { status: 400 });
  }
  if (!["MIS_API", "RP_ACTIVITY", "MANUAL_ADMIN"].includes(captureSource)) {
    return Response.json({ error: "Invalid captureSource" }, { status: 400 });
  }

  const id = randomUUID();
  try {
    await prisma.$executeRaw`
      INSERT INTO "FacilityIndicatorDef" (
        id, key, label, description, domain, "facilityLayerKey", "schemeId",
        unit, frequency, color, "targetFormula",
        "captureSource", "misProviderId", "misFetchConfig",
        "staleYellowDays", "staleRedDays", "sortOrder", "isActive",
        "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${key}, ${label}, ${description ?? null}, ${domain},
        ${facilityLayerKey ?? null}, ${schemeId ?? null},
        ${unit ?? null}, ${(frequency ?? "Monthly")}::"MetricFrequency",
        ${color ?? "#6366f1"},
        ${targetFormula ? JSON.stringify(targetFormula) : null}::jsonb,
        ${captureSource}::"FacilityIndicatorSource",
        ${misProviderId ?? null},
        ${misFetchConfig ? JSON.stringify(misFetchConfig) : null}::jsonb,
        ${staleYellowDays ?? 45}, ${staleRedDays ?? 90},
        ${sortOrder ?? 0}, true,
        NOW(), NOW()
      )
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return Response.json({ error: "Indicator key already exists" }, { status: 409 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }

  return Response.json({ id, ...body }, { status: 201 });
}
