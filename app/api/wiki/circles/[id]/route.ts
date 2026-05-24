import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const circle = await prisma.wikiPracticeCircle.findUnique({
    where: { id },
    include: {
      facilitator: { select: { id: true, name: true, image: true } },
      zone: { select: { id: true, name: true } },
      attendees: { select: { id: true, name: true, image: true } },
      linkedPages: { select: { id: true, slug: true, title: true, status: true } },
    },
  });
  if (!circle) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ circle });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const circle = await prisma.wikiPracticeCircle.findUnique({
    where: { id },
    select: { id: true, facilitatorId: true, completedAt: true },
  });
  if (!circle) return Response.json({ error: "Not found" }, { status: 404 });

  const steward = await isWikiSteward(userId);
  if (circle.facilitatorId !== userId && !steward) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: {
    notes?: string | null;
    caseDiscussed?: string | null;
    completedAt?: Date | null;
    recordingUrl?: string | null;
  } = {};
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;
  if (typeof body.caseDiscussed === "string") data.caseDiscussed = body.caseDiscussed.trim() || null;
  if (typeof body.recordingUrl === "string") data.recordingUrl = body.recordingUrl.trim() || null;
  if (body.markCompleted === true && !circle.completedAt) data.completedAt = new Date();
  if (body.markCompleted === false) data.completedAt = null;

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const updated = await prisma.wikiPracticeCircle.update({
    where: { id: circle.id },
    data,
    select: { id: true, completedAt: true },
  });

  return Response.json({ circle: updated });
}
