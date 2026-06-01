import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { slugifyTitle } from "@/lib/wiki/slug";
import type { NextRequest } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const meetings = await prisma.wikiPartnerReviewMeeting.findMany({
    where: { archivedAt: null },
    orderBy: { scheduledFor: "desc" },
    take: 200,
    select: {
      id: true,
      scheduledFor: true,
      completedAt: true,
      practiceChangesNoted: true,
      partnerOrg: { select: { id: true, name: true, slug: true } },
      _count: { select: { attendees: true, linkedPages: true } },
    },
  });

  return Response.json({ meetings });
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

  // Find-or-create partner org by name. Stewards don't have a separate orgs
  // admin UI yet — adding a partner is a side effect of scheduling the first
  // meeting with them.
  let partnerOrgId: string | null = null;
  if (typeof body.partnerOrgId === "string" && body.partnerOrgId) {
    partnerOrgId = body.partnerOrgId;
  } else if (typeof body.partnerOrgName === "string" && body.partnerOrgName.trim()) {
    const name = body.partnerOrgName.trim();
    const slugBase = slugifyTitle(name) || "partner";
    // Find by case-insensitive name first
    const existing = await prisma.org.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, kind: "partner" },
      select: { id: true },
    });
    if (existing) {
      partnerOrgId = existing.id;
    } else {
      // Slug collision handler
      let slug = slugBase;
      for (let i = 2; i < 100; i++) {
        const clash = await prisma.org.findUnique({ where: { slug }, select: { id: true } });
        if (!clash) break;
        slug = `${slugBase}-${i}`;
      }
      const org = await prisma.org.create({
        data: { name, slug, kind: "partner" },
        select: { id: true },
      });
      partnerOrgId = org.id;
    }
  }
  if (!partnerOrgId) {
    return Response.json(
      { error: "partnerOrgId or partnerOrgName required" },
      { status: 400 },
    );
  }

  const attendeeIds: string[] = Array.isArray(body.attendeeIds)
    ? body.attendeeIds.filter((s: unknown): s is string => typeof s === "string")
    : [];
  const linkedPageIds: string[] = Array.isArray(body.linkedPageIds)
    ? body.linkedPageIds.filter((s: unknown): s is string => typeof s === "string")
    : [];
  const language = typeof body.language === "string" ? body.language : "en";

  const meeting = await prisma.wikiPartnerReviewMeeting.create({
    data: {
      partnerOrgId,
      scheduledFor,
      language,
      attendees: attendeeIds.length > 0 ? { connect: attendeeIds.map((id) => ({ id })) } : undefined,
      linkedPages: linkedPageIds.length > 0 ? { connect: linkedPageIds.map((id) => ({ id })) } : undefined,
    },
    select: { id: true },
  });

  return Response.json({ meeting }, { status: 201 });
}
