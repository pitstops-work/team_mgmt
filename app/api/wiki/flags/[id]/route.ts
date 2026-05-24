import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import type { NextRequest } from "next/server";

const VALID_STATUSES = new Set(["open", "acknowledged", "resolved"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const flag = await prisma.wikiFlag.findUnique({
    where: { id },
    select: {
      id: true,
      flaggerId: true,
      status: true,
      page: { select: { ownerId: true } },
    },
  });
  if (!flag) return Response.json({ error: "Not found" }, { status: 404 });

  const steward = await isWikiSteward(userId);
  // Flagger can withdraw their own flag (resolve); owner + steward can change any state.
  const canModify = flag.page.ownerId === userId || flag.flaggerId === userId || steward;
  if (!canModify) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  const nextStatus = typeof body.status === "string" ? body.status : "";
  if (!VALID_STATUSES.has(nextStatus)) {
    return Response.json({ error: "status must be open | acknowledged | resolved" }, { status: 400 });
  }

  const updated = await prisma.wikiFlag.update({
    where: { id: flag.id },
    data: {
      status: nextStatus,
      resolvedAt: nextStatus === "resolved" ? new Date() : null,
    },
    include: { flagger: { select: { id: true, name: true, image: true } } },
  });

  return Response.json({ flag: updated });
}
