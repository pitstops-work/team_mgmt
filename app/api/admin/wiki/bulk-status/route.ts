import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import type { NextRequest } from "next/server";

const ALLOWED_STATUSES = new Set([
  "draft",
  "published",
  "under_review",
  "orphaned",
  "retired",
]);

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const steward = await isWikiSteward(userId);
  if (!steward) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const pageIds: string[] = Array.isArray(body.pageIds)
    ? body.pageIds.filter((s: unknown): s is string => typeof s === "string")
    : [];
  const status = typeof body.status === "string" ? body.status : "";

  if (pageIds.length === 0) {
    return Response.json({ error: "pageIds required" }, { status: 400 });
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const result = await prisma.wikiPage.updateMany({
    where: { id: { in: pageIds } },
    data: {
      status,
      ...(status === "retired" ? { archivedAt: new Date() } : {}),
    },
  });

  return Response.json({ ok: true, updated: result.count });
}
