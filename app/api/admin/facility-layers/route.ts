import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";
import { randomUUID } from "crypto";

const DEFAULTS = [
  { layerKey: "creches",          label: "Creche",                needsDomain: "Creche",              sortOrder: 0 },
  { layerKey: "children_centres", label: "Children Centre",       needsDomain: "ChildrenCentre",       sortOrder: 1 },
  { layerKey: "youth_centres",    label: "Youth Resource Centre", needsDomain: "YouthResourceCentre",  sortOrder: 2 },
  { layerKey: "elderly_centres",  label: "Elderly Centre",        needsDomain: null,                   sortOrder: 3 },
  { layerKey: "water_atms",       label: "Water ATM",             needsDomain: null,                   sortOrder: 4 },
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let rows = await prisma.$queryRaw<{ id: string; layerKey: string; label: string; needsDomain: string | null; sortOrder: number }[]>`
    SELECT id, "layerKey", label, "needsDomain", "sortOrder"
    FROM "FacilityLayerConfig"
    WHERE "isActive" = true
    ORDER BY "sortOrder" ASC, label ASC
  `;

  if (rows.length === 0) {
    for (const d of DEFAULTS) {
      await prisma.$executeRaw`
        INSERT INTO "FacilityLayerConfig" (id, "layerKey", label, "needsDomain", "sortOrder", "isActive", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${d.layerKey}, ${d.label}, ${d.needsDomain}, ${d.sortOrder}, true, NOW(), NOW())
        ON CONFLICT ("layerKey") DO NOTHING
      `;
    }
    rows = await prisma.$queryRaw<{ id: string; layerKey: string; label: string; needsDomain: string | null; sortOrder: number }[]>`
      SELECT id, "layerKey", label, "needsDomain", "sortOrder"
      FROM "FacilityLayerConfig"
      WHERE "isActive" = true
      ORDER BY "sortOrder" ASC, label ASC
    `;
  }

  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { layerKey, label, needsDomain, sortOrder } = await req.json();
  if (!layerKey || !label) return Response.json({ error: "layerKey and label are required" }, { status: 400 });

  const id = randomUUID();
  try {
    await prisma.$executeRaw`
      INSERT INTO "FacilityLayerConfig" (id, "layerKey", label, "needsDomain", "sortOrder", "isActive", "createdAt", "updatedAt")
      VALUES (${id}, ${layerKey}, ${label}, ${needsDomain ?? null}, ${sortOrder ?? 0}, true, NOW(), NOW())
    `;
  } catch {
    return Response.json({ error: "Layer key already exists" }, { status: 409 });
  }

  return Response.json({ id, layerKey, label, needsDomain: needsDomain ?? null, sortOrder: sortOrder ?? 0 }, { status: 201 });
}
