import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward, isWikiCurator } from "@/lib/wiki/auth";
import type { NextRequest } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [steward, curator] = await Promise.all([
    isWikiSteward(userId),
    isWikiCurator(userId),
  ]);
  if (!steward && !curator) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const resolved = body?.resolved === true;

  const updated = await prisma.wikiTranslationFlag.update({
    where: { id },
    data: resolved
      ? { status: "resolved", resolvedAt: new Date() }
      : { status: "open", resolvedAt: null },
    select: { id: true, status: true },
  });

  return Response.json({ flag: updated });
}
