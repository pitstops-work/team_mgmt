import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import WikiListView from "./WikiListView";

export default async function WikiIndexPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [pages, steward] = await Promise.all([
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
      },
      take: 200,
    }),
    userId ? isWikiSteward(userId) : Promise.resolve(false),
  ]);

  return (
    <WikiListView
      initialPages={JSON.parse(JSON.stringify(pages))}
      canCreate={steward}
    />
  );
}
