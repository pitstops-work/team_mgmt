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
  const meeting = await prisma.wikiPartnerReviewMeeting.findUnique({
    where: { id },
    include: {
      partnerOrg: { select: { id: true, name: true, slug: true } },
      attendees: { select: { id: true, name: true, image: true } },
      linkedPages: { select: { id: true, slug: true, title: true, status: true } },
    },
  });
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ meeting });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const steward = await isWikiSteward(userId);
  if (!steward) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const meeting = await prisma.wikiPartnerReviewMeeting.findUnique({
    where: { id },
    select: { id: true, completedAt: true },
  });
  if (!meeting) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const data: {
    notes?: string | null;
    practiceChangesNoted?: string | null;
    completedAt?: Date | null;
  } = {};
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;
  if (typeof body.practiceChangesNoted === "string")
    data.practiceChangesNoted = body.practiceChangesNoted.trim() || null;
  if (body.markCompleted === true && !meeting.completedAt) data.completedAt = new Date();
  if (body.markCompleted === false) data.completedAt = null;

  if (Object.keys(data).length === 0) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const updated = await prisma.wikiPartnerReviewMeeting.update({
    where: { id: meeting.id },
    data,
    select: { id: true, completedAt: true },
  });

  return Response.json({ meeting: updated });
}
