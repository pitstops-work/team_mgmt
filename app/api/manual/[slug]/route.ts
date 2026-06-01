import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { MANUAL_TYPE } from "@/lib/wiki/manual";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

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
        select: {
          id: true,
          kind: true,
          note: true,
          toPage: { select: { slug: true, title: true, maturity: true, type: true } },
        },
        orderBy: { kind: "asc" },
      },
      boundariesTo: {
        select: {
          id: true,
          kind: true,
          note: true,
          fromPage: { select: { slug: true, title: true, maturity: true, type: true } },
        },
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

  if (!page || page.archivedAt || page.type !== MANUAL_TYPE) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ manual: page });
}
