import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { notFound } from "next/navigation";
import WikiReaderView from "./WikiReaderView";

export default async function WikiPageReader({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) notFound();

  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      lastEditor: { select: { id: true, name: true } },
      tags: { select: { tagType: true, tagValue: true } },
    },
  });
  if (!page || page.archivedAt) notFound();

  const [steward, comments, flags] = await Promise.all([
    isWikiSteward(userId),
    prisma.wikiComment.findMany({
      where: { pageId: page.id },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, name: true, image: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.wikiFlag.findMany({
      where: { pageId: page.id },
      orderBy: { createdAt: "asc" },
      include: { flagger: { select: { id: true, name: true, image: true } } },
    }),
  ]);

  return (
    <WikiReaderView
      page={JSON.parse(JSON.stringify(page))}
      initialComments={JSON.parse(JSON.stringify(comments))}
      initialFlags={JSON.parse(JSON.stringify(flags))}
      currentUserId={userId}
      isSteward={steward}
    />
  );
}
