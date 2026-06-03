import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiSteward } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import AuditView from "./AuditView";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function WikiAuditPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const steward = await isWikiSteward(userId);
  if (!steward) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-600 text-sm">
          The annual audit is steward-only.
        </div>
      </main>
    );
  }

  const pages = await prisma.wikiPage.findMany({
    where: { archivedAt: null },
    orderBy: { title: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      status: true,
      canonicalLang: true,
      translatedContent: true,
      lastEditedAt: true,
      lastReviewedAt: true,
      nextReviewDue: true,
      ownerTermStart: true,
      owner: { select: { id: true, name: true } },
      _count: {
        select: {
          flags: true,
          versions: true,
          views: true,
        },
      },
    },
  });

  const now = new Date();
  const decorated = pages.map((p) => {
    const translationCount = p.translatedContent
      ? Object.keys(p.translatedContent as Record<string, unknown>).filter(
          (lang) => (p.translatedContent as Record<string, { content?: string }>)[lang]?.content,
        ).length
      : 0;
    const daysSinceReview = p.lastReviewedAt
      ? Math.floor((now.getTime() - new Date(p.lastReviewedAt).getTime()) / DAY_MS)
      : null;
    const ownerTenureDays = p.ownerTermStart
      ? Math.floor((now.getTime() - new Date(p.ownerTermStart).getTime()) / DAY_MS)
      : null;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      type: p.type,
      status: p.status,
      canonicalLang: p.canonicalLang,
      lastEditedAt: p.lastEditedAt.toISOString(),
      nextReviewDue: p.nextReviewDue?.toISOString() ?? null,
      owner: p.owner,
      views: p._count.views,
      flagsTotal: p._count.flags,
      versions: p._count.versions,
      translationCount,
      daysSinceReview,
      ownerTenureDays,
    };
  });

  return (
    <SurfaceProvider id="wiki.audit">
      <AuditView pages={decorated} />
    </SurfaceProvider>
  );
}
