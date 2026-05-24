import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward, isWikiCurator } from "@/lib/wiki/auth";
import WikiListView from "./WikiListView";

export default async function WikiIndexPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [pages, steward, curator, ownedCount] = await Promise.all([
    prisma.wikiPage.findMany({
      where: { archivedAt: null, status: { not: "retired" } },
      orderBy: { lastEditedAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        type: true,
        canonicalLang: true,
        status: true,
        lastEditedAt: true,
        nextReviewDue: true,
        owner: { select: { id: true, name: true, image: true } },
        tags: { select: { tagType: true, tagValue: true } },
        _count: {
          select: {
            flags: { where: { status: { not: "resolved" } } },
            comments: { where: { resolvedAt: null } },
          },
        },
      },
      take: 200,
    }),
    userId ? isWikiSteward(userId) : Promise.resolve(false),
    userId ? isWikiCurator(userId) : Promise.resolve(false),
    userId
      ? prisma.wikiPage.count({
          where: { ownerId: userId, archivedAt: null, status: { not: "retired" } },
        })
      : Promise.resolve(0),
  ]);

  const decorated = pages.map((p) => ({
    ...p,
    openFlagCount: p._count.flags,
    unresolvedCommentCount: p._count.comments,
  }));

  return (
    <WikiListView
      initialPages={JSON.parse(JSON.stringify(decorated))}
      canCreate={steward}
      hasDashboard={steward || curator || ownedCount > 0}
    />
  );
}
