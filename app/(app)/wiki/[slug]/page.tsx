import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canArchivePage, isWikiCurator, isWikiSteward } from "@/lib/wiki/auth";
import { notFound } from "next/navigation";
import WikiReaderView from "./WikiReaderView";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

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

  // Record a view if the user hasn't viewed this page in the last 24 hours.
  // Fire-and-forget — we don't want view tracking to gate the render.
  void (async () => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await prisma.wikiPageView.findFirst({
        where: { pageId: page.id, userId, createdAt: { gte: since } },
        select: { id: true },
      });
      if (!recent) {
        await prisma.wikiPageView.create({ data: { pageId: page.id, userId } });
      }
    } catch {
      // Best-effort.
    }
  })();

  const [me, steward, curator, comments, flags, pendingReviews, pendingHandover] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { preferredLang: true },
    }),
    isWikiSteward(userId),
    isWikiCurator(userId),
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
    prisma.wikiReviewCycle.findMany({
      where: {
        pageId: page.id,
        completedAt: null,
        type: { in: ["post_circle", "post_partner_review"] },
      },
      include: {
        triggerCircle: {
          select: { id: true, scheduledFor: true, completedAt: true },
        },
        triggerPartnerReviewMeeting: {
          select: {
            id: true,
            scheduledFor: true,
            completedAt: true,
            partnerOrg: { select: { name: true } },
          },
        },
      },
    }),
    prisma.wikiOwnerHandover.findFirst({
      where: { pageId: page.id, status: "pending" },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
      },
    }),
  ]);

  return (
    <SurfaceProvider id="wiki.reader">
      <WikiReaderView
        page={JSON.parse(JSON.stringify(page))}
        initialComments={JSON.parse(JSON.stringify(comments))}
        initialFlags={JSON.parse(JSON.stringify(flags))}
        pendingReviews={JSON.parse(JSON.stringify(pendingReviews))}
        pendingHandover={pendingHandover ? JSON.parse(JSON.stringify(pendingHandover)) : null}
        currentUserId={userId}
        isSteward={steward}
        canArchive={canArchivePage(steward, curator)}
        preferredLang={me?.preferredLang ?? "en"}
      />
    </SurfaceProvider>
  );
}
