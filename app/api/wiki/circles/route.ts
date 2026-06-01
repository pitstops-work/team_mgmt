import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import type { NextRequest } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const circles = await prisma.wikiPracticeCircle.findMany({
    where: { archivedAt: null },
    orderBy: { scheduledFor: "desc" },
    take: 200,
    select: {
      id: true,
      scheduledFor: true,
      completedAt: true,
      vertical: true,
      caseDiscussed: true,
      facilitator: { select: { id: true, name: true, image: true } },
      zone: { select: { id: true, name: true } },
      _count: { select: { attendees: true, linkedPages: true } },
    },
  });

  return Response.json({ circles });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const steward = await isWikiSteward(userId);
  if (!steward) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const scheduledFor =
    typeof body.scheduledFor === "string" ? new Date(body.scheduledFor) : null;
  if (!scheduledFor || isNaN(scheduledFor.getTime())) {
    return Response.json({ error: "scheduledFor required (ISO date)" }, { status: 400 });
  }

  const facilitatorId =
    typeof body.facilitatorId === "string" && body.facilitatorId
      ? body.facilitatorId
      : userId;
  const vertical = typeof body.vertical === "string" ? body.vertical.trim() || null : null;
  const zoneId = typeof body.zoneId === "string" && body.zoneId ? body.zoneId : null;
  const caseDiscussed = typeof body.caseDiscussed === "string" ? body.caseDiscussed.trim() || null : null;
  const language = typeof body.language === "string" ? body.language : "en";
  const attendeeIds: string[] = Array.isArray(body.attendeeIds)
    ? body.attendeeIds.filter((s: unknown): s is string => typeof s === "string")
    : [];
  const linkedPageIds: string[] = Array.isArray(body.linkedPageIds)
    ? body.linkedPageIds.filter((s: unknown): s is string => typeof s === "string")
    : [];

  const circle = await prisma.wikiPracticeCircle.create({
    data: {
      scheduledFor,
      facilitatorId,
      vertical,
      zoneId,
      caseDiscussed,
      language,
      attendees: attendeeIds.length > 0 ? { connect: attendeeIds.map((id) => ({ id })) } : undefined,
      linkedPages: linkedPageIds.length > 0 ? { connect: linkedPageIds.map((id) => ({ id })) } : undefined,
    },
    select: { id: true },
  });

  return Response.json({ circle }, { status: 201 });
}
