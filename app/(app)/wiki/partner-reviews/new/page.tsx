import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiSteward } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import PartnerReviewNewForm from "./PartnerReviewNewForm";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function NewPartnerReviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const steward = await isWikiSteward(userId);
  if (!steward) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-600 text-sm">Only stewards can schedule partner reviews.</div>
      </main>
    );
  }

  const [users, partnerOrgs, pages] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.org.findMany({
      where: { kind: "partner" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.wikiPage.findMany({
      where: { archivedAt: null, status: { not: "retired" } },
      select: { id: true, slug: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <SurfaceProvider id="wiki.partner_review_new">
      <PartnerReviewNewForm
        users={JSON.parse(JSON.stringify(users))}
        partnerOrgs={JSON.parse(JSON.stringify(partnerOrgs))}
        pages={JSON.parse(JSON.stringify(pages))}
      />
    </SurfaceProvider>
  );
}
