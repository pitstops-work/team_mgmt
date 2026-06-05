import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/auditLog";
import type { NextRequest } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id, linkId } = await params;
  const body = (await req.json()) as { ordinal?: number };
  if (body.ordinal === undefined) return Response.json({ error: "ordinal required" }, { status: 400 });

  const link = await prisma.wikiArticleLink.findUnique({ where: { id: linkId } });
  if (!link || link.fromArticleId !== id) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.wikiArticleLink.update({
    where: { id: linkId },
    data: { ordinal: body.ordinal },
  });
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id, linkId } = await params;

  const link = await prisma.wikiArticleLink.findUnique({
    where: { id: linkId },
    include: { to: { select: { slug: true } } },
  });
  if (!link || link.fromArticleId !== id) return Response.json({ error: "Not found" }, { status: 404 });

  await prisma.wikiArticleLink.delete({ where: { id: linkId } });
  auditLog({
    entityType: "WikiArticle",
    entityId: id,
    userId,
    action: "link_removed",
    field: link.panel,
    oldValue: link.to.slug,
  });
  return Response.json({ ok: true });
}
