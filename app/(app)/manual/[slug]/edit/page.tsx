import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { canEditPage, isWikiSteward } from "@/lib/wiki/auth";
import { MANUAL_TYPE } from "@/lib/wiki/manual";
import EditManualForm from "./EditManualForm";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function EditManualPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) redirect("/login");

  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    include: {
      manualSections: {
        orderBy: { sectionNumber: "asc" },
        select: { sectionNumber: true, content: true },
      },
    },
  });

  if (!page || page.archivedAt || page.type !== MANUAL_TYPE) notFound();

  const steward = await isWikiSteward(userId);
  if (!canEditPage(page, session, steward)) redirect(`/manual/${slug}`);

  return (
    <SurfaceProvider id="manual.editor">
      <EditManualForm
        page={{
          slug: page.slug,
          title: page.title,
          canonicalContent: page.canonicalContent,
          maturity: page.maturity,
          isSensitive: page.isSensitive,
          sensitiveNote: page.sensitiveNote,
        }}
        sections={page.manualSections.map((s) => ({
          sectionNumber: s.sectionNumber,
          content: s.content,
        }))}
      />
    </SurfaceProvider>
  );
}
