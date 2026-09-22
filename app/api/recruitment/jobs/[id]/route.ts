import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import { normaliseLocationIds } from "@/lib/recruitment/locations";

// GET    /api/recruitment/jobs/[id] — read one (with location + scouting-day list)
// PUT    /api/recruitment/jobs/[id] — update
// DELETE /api/recruitment/jobs/[id] — soft-archive (ScoutingDay FKs to it, keep row)

function coerceStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}
function coerceTheme(v: unknown): "football" | "neutral" {
  return v === "neutral" ? "neutral" : "football";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await buildRbacContext(await auth(), { req });
  if (!(await can(ctx, "recruitment", "read"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const row = await prisma.recruitmentJob.findUnique({
    where: { id },
    include: {
      location: true,
      locations: { orderBy: { city: "asc" } },
      scoutingDays: {
        orderBy: { createdAt: "desc" },
        select: { id: true, slug: true, title: true, matchday: true, createdAt: true },
      },
    },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await buildRbacContext(await auth(), { req });
  if (!(await can(ctx, "recruitment", "update"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad body" }, { status: 400 });

  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const locationId = String(body.locationId || "").trim();
  if (!locationId) return NextResponse.json({ error: "Location is required" }, { status: 400 });

  // Primary + the full city set. `set` replaces the membership wholesale, so a
  // city removed here is genuinely dropped; normaliseLocationIds keeps the
  // primary in the set so the two can never drift apart.
  const { locationIds } = normaliseLocationIds(locationId, body.locationIds);
  const foundCount = await prisma.recruitmentLocation.count({ where: { id: { in: locationIds } } });
  if (foundCount !== locationIds.length) {
    return NextResponse.json({ error: "One or more locations not found" }, { status: 404 });
  }

  const lockedAxes = coerceStringArray(body.lockedAxes);
  if (lockedAxes.length !== 0 && lockedAxes.length !== 6) {
    return NextResponse.json({ error: "lockedAxes must be exactly 6 labels or empty" }, { status: 400 });
  }

  const row = await prisma.recruitmentJob.update({
    where: { id },
    data: {
      title,
      seniority: body.seniority ? String(body.seniority).trim() || null : null,
      locationId,
      locations: { set: locationIds.map((id) => ({ id })) },
      dayToDay: body.dayToDay ? String(body.dayToDay) : "",
      mustHaves: coerceStringArray(body.mustHaves),
      niceToHaves: coerceStringArray(body.niceToHaves),
      hardDisqualifiers: coerceStringArray(body.hardDisqualifiers),
      salaryBand: body.salaryBand ? String(body.salaryBand).trim() || null : null,
      theme: coerceTheme(body.theme),
      notes: body.notes ? String(body.notes) : "",
      redFlagRules: coerceStringArray(body.redFlagRules),
      yellowFlagRules: coerceStringArray(body.yellowFlagRules),
      scrutiniseFor: coerceStringArray(body.scrutiniseFor),
      lockedAxes,
    },
    include: { location: true, locations: true },
  });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await buildRbacContext(await auth(), { req });
  if (!(await can(ctx, "recruitment", "delete"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  await prisma.recruitmentJob.update({ where: { id }, data: { archivedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
