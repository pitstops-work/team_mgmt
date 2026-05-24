import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { notFound, redirect } from "next/navigation";
import WikiEditor from "./WikiEditor";

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

  return (
    <WikiEditor
      slug={page.slug}
      initialTitle={page.title}
      initialContent={page.canonicalContent}
      type={page.type}
    />
  );
}
