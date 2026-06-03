import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { notFound, redirect } from "next/navigation";
import WikiEditor from "./WikiEditor";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function WikiEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      canonicalLang: true,
      canonicalContent: true,
      ownerId: true,
      archivedAt: true,
    },
  });
  if (!page || page.archivedAt) notFound();

  const steward = await isWikiSteward(userId);
  const canEdit = page.ownerId === userId || steward;
  if (!canEdit) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-600 text-sm">
          You don't have permission to edit this page.
        </div>
      </main>
    );
  }

  const [openFlags, unresolvedComments] = await Promise.all([
    prisma.wikiFlag.findMany({
      where: { pageId: page.id, status: { not: "resolved" } },
      orderBy: { createdAt: "asc" },
      include: { flagger: { select: { id: true, name: true, image: true } } },
    }),
    prisma.wikiComment.findMany({
      where: { pageId: page.id, resolvedAt: null },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, name: true, image: true } } },
    }),
  ]);

  return (
    <SurfaceProvider id="wiki.editor">
      <WikiEditor
        slug={page.slug}
        initialTitle={page.title}
        initialContent={page.canonicalContent}
        type={page.type}
        openFlags={JSON.parse(JSON.stringify(openFlags))}
        unresolvedComments={JSON.parse(JSON.stringify(unresolvedComments))}
      />
    </SurfaceProvider>
  );
}
