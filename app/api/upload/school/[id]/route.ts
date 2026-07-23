// DELETE a SchoolPlanArtifact by id — removes the Vercel Blob object then the
// SchoolPlanArtifact row. Same access check as the POST sibling.

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { del } from "@vercel/blob";
import { getSchoolPlanAccess, canEditPlan } from "@/lib/schoolPlan/access";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const artifact = await prisma.schoolPlanArtifact.findUnique({
    where: { id },
    select: { url: true, planId: true },
  });
  if (!artifact) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await getSchoolPlanAccess(session);
  if (!canEditPlan(access, artifact.planId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try { await del(artifact.url); } catch { /* blob may already be gone */ }
  await prisma.schoolPlanArtifact.delete({ where: { id } });

  return Response.json({ ok: true });
}
