import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const {
    key, label, description, unit,
    captureSource = "MANUAL_ADMIN",
    bindingTemplateSlug, bindingChecklistKey,
    targetValue, targetCadence, sortOrder = 0,
  } = body;

  if (!key || !label) return Response.json({ error: "key + label required" }, { status: 400 });
  if (!["MANUAL_ADMIN", "RP_ACTIVITY"].includes(captureSource)) {
    return Response.json({ error: "Invalid captureSource" }, { status: 400 });
  }
  if (captureSource === "RP_ACTIVITY" && (!bindingTemplateSlug || !bindingChecklistKey)) {
    return Response.json({ error: "RP_ACTIVITY requires bindingTemplateSlug + bindingChecklistKey" }, { status: 400 });
  }

  const outcomeId = randomUUID();
  try {
    await prisma.$executeRaw`
      INSERT INTO "ProgrammeJourneyOutcome" (
        id, "journeyId", key, label, description, unit,
        "captureSource", "bindingTemplateSlug", "bindingChecklistKey",
        "targetValue", "targetCadence", "sortOrder", "isActive",
        "createdAt", "updatedAt"
      ) VALUES (
        ${outcomeId}, ${id}, ${key}, ${label}, ${description ?? null}, ${unit ?? null},
        ${captureSource}, ${bindingTemplateSlug ?? null}, ${bindingChecklistKey ?? null},
        ${targetValue ?? null}, ${targetCadence ?? null}, ${sortOrder}, true,
        NOW(), NOW()
      )
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique")) return Response.json({ error: "key already exists in this journey" }, { status: 409 });
    return Response.json({ error: msg }, { status: 500 });
  }

  return Response.json({ id: outcomeId }, { status: 201 });
}
