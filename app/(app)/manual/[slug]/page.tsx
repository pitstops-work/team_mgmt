import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { MANUAL_TYPE } from "@/lib/wiki/manual";
import { canEditPage, isWikiSteward } from "@/lib/wiki/auth";
import ManualReaderView from "./ManualReaderView";

export default async function ManualReaderPage({
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
      manualSections: {
        orderBy: { sectionNumber: "asc" },
        select: { sectionNumber: true, content: true, lastEditedAt: true },
      },
      boundariesFrom: {
        include: { toPage: { select: { slug: true, title: true, maturity: true, type: true } } },
        orderBy: { kind: "asc" },
      },
      boundariesTo: {
        include: { fromPage: { select: { slug: true, title: true, maturity: true, type: true } } },
        orderBy: { kind: "asc" },
      },
      practiceEntries: {
        where: { archivedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          observer: { select: { id: true, name: true, image: true } },
          partnerOrg: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!page || page.archivedAt || page.type !== MANUAL_TYPE) notFound();

  const steward = await isWikiSteward(userId);
  const canEdit = canEditPage(page, session, steward);

  return (
    <ManualReaderView
      page={JSON.parse(JSON.stringify(page))}
      currentUserId={userId}
      canEdit={canEdit}
    />
  );
}
