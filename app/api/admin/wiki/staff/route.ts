import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { NextRequest } from "next/server";

/**
 * Wiki-staff designation. Admin / super-admin only.
 *
 * `WikiStaff` grants `curator` or `steward` role on top of the regular user.
 * Curators run the weekly gap-queue walk, the stale-page sweep, and translation
 * triage. Stewards have higher-level powers (cross-page edits, retire). See
 * `lib/wiki/auth.ts` for the gate helpers.
 *
 * Scope:
 *   null              → global
 *   { cities: [...] } → restricted to those cities
 *   etc.
 */
function isAdminSession(role: string | undefined): boolean {
  return role === "admin" || role === "super-admin";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminSession(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.wikiStaff.findMany({
    orderBy: [{ wikiRole: "asc" }, { createdAt: "asc" }],
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
  return Response.json({ staff: rows });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminSession(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const wikiRole = typeof body.wikiRole === "string" ? body.wikiRole : "";
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });
  if (wikiRole !== "curator" && wikiRole !== "steward") {
    return Response.json({ error: "wikiRole must be curator or steward" }, { status: 400 });
  }

  // Scope: null = global, or { cities: [...] } when caller restricts.
  const cities: string[] = Array.isArray(body.cities)
    ? body.cities.filter((c: unknown): c is string => typeof c === "string" && c.length > 0)
    : [];
  const scope = cities.length > 0 ? { cities } : null;

  const userExists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!userExists) return Response.json({ error: "user not found" }, { status: 400 });

  // Idempotent: same user+role row gets its scope updated rather than failing
  // on the (userId, wikiRole) unique constraint.
  const existing = await prisma.wikiStaff.findUnique({
    where: { userId_wikiRole: { userId, wikiRole } },
    select: { id: true },
  });
  const row = existing
    ? await prisma.wikiStaff.update({
        where: { id: existing.id },
        data: { scope: scope ?? undefined },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      })
    : await prisma.wikiStaff.create({
        data: { userId, wikiRole, scope: scope ?? undefined },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      });

  return Response.json({ row }, { status: existing ? 200 : 201 });
}
