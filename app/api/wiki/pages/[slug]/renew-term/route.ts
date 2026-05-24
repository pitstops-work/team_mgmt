import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { nextOwnerTermEnd } from "@/lib/wiki/review";
import type { NextRequest } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    select: { id: true, ownerId: true },
  });
  if (!page) return Response.json({ error: "Not found" }, { status: 404 });

  const steward = await isWikiSteward(userId);
  if (page.ownerId !== userId && !steward) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!page.ownerId) {
    return Response.json({ error: "Page has no owner to renew" }, { status: 400 });
  }

  const now = new Date();
  const updated = await prisma.wikiPage.update({
    where: { id: page.id },
    data: {
      ownerTermStart: now,
      ownerTermEnd: nextOwnerTermEnd(now),
    },
    select: { id: true, ownerTermStart: true, ownerTermEnd: true },
  });

  return Response.json({ page: updated });
}
