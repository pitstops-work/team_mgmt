import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import type { NextRequest } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const comment = await prisma.wikiComment.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      resolvedAt: true,
      page: { select: { ownerId: true } },
    },
  });
  if (!comment) return Response.json({ error: "Not found" }, { status: 404 });

  const steward = await isWikiSteward(userId);
  const canModify =
    comment.authorId === userId || comment.page.ownerId === userId || steward;
  if (!canModify) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof body.resolved !== "boolean") {
    return Response.json({ error: "resolved (boolean) required" }, { status: 400 });
  }

  const updated = await prisma.wikiComment.update({
    where: { id: comment.id },
    data: body.resolved
      ? { resolvedAt: new Date(), resolvedById: userId }
      : { resolvedAt: null, resolvedById: null },
    include: {
      author: { select: { id: true, name: true, image: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });

  return Response.json({ comment: updated });
}
