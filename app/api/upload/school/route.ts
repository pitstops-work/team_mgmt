// Sibling of /api/upload — accepts a planId + kind + optional stepId + caption
// and stores the result as a SchoolPlanArtifact row. Uses the same private
// Vercel Blob store as the main upload route.

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { put } from "@vercel/blob";
import { getSchoolPlanAccess, canEditPlan } from "@/lib/schoolPlan/access";

const ALLOWED_KINDS = new Set([
  "survey_drawing", "photo", "map", "architect_design", "vendor_quote",
  "budget_working", "permission_letter", "partner_agreement", "other",
]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const planId = String(formData.get("planId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "other");
  const stepId = (formData.get("stepId") as string | null) || null;
  const caption = (formData.get("caption") as string | null)?.trim() || null;

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
  if (!planId) return Response.json({ error: "planId required" }, { status: 400 });
  const kind = ALLOWED_KINDS.has(kindRaw) ? kindRaw : "other";

  const access = await getSchoolPlanAccess(session);
  if (!canEditPlan(access, planId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const plan = await prisma.schoolPlan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!plan) return Response.json({ error: "Plan not found" }, { status: 404 });

  const safeName = `school-${planId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  let url: string;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const blob = await put(safeName, buffer, {
      access: "private",
      contentType: file.type || "application/octet-stream",
    });
    url = blob.url;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/upload/school] blob put failed:", msg);
    return Response.json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }

  const artifact = await prisma.schoolPlanArtifact.create({
    data: {
      planId,
      stepId: stepId || null,
      kind,
      name: file.name,
      url,
      size: file.size ?? null,
      mimeType: file.type || null,
      caption,
      uploadedById: session.user.id,
    },
    select: { id: true, name: true, url: true, kind: true },
  });

  return Response.json(artifact, { status: 201 });
}
