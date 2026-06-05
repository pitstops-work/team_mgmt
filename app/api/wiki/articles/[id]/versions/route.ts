import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const versions = await prisma.wikiArticleVersion.findMany({
    where: { articleId: id },
    orderBy: { versionNumber: "desc" },
    include: { savedBy: { select: { id: true, name: true, image: true } } },
    take: 100,
  });

  return Response.json({
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      title: v.title,
      contentJson: v.contentJson,
      savedAt: v.savedAt,
      summary: v.summary,
      savedBy: v.savedBy,
    })),
  });
}
