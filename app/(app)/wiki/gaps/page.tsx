import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiCurator } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import GapsView from "./GapsView";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function WikiGapsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const curator = await isWikiCurator(userId);

  // Curators see every open + assigned + drafted gap.
  // Non-curators see gaps they filed or were assigned, plus a "file new" form.
  const gaps = await prisma.wikiPracticeGap.findMany({
    where: {
      archivedAt: null,
      ...(curator
        ? { resolvedAt: null }
        : { OR: [{ filerId: userId }, { assignedOwnerId: userId }] }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      filer: { select: { id: true, name: true } },
      assignedOwner: { select: { id: true, name: true } },
      partnerOrg: { select: { id: true, name: true, slug: true } },
      linkedPage: { select: { id: true, slug: true, title: true } },
    },
  });

  // For curator triage: dropdown of partner orgs + dropdown of potential owners
  // (= anyone who already owns a wiki page; cheap proxy for "wiki-active user").
  const [partnerOrgs, candidateOwners, needsDomains] = await Promise.all([
    curator
      ? prisma.org.findMany({
          where: { kind: "partner" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve([] as { id: string; name: string; slug: string }[]),
    curator
      ? prisma.user.findMany({
          where: { ownedWikiPages: { some: { archivedAt: null } } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([] as { id: string; name: string | null; email: string | null }[]),
    prisma.needsFormulaConfig.findMany({
      where: { isActive: true },
      select: { domain: true, label: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  // Coalesce nullable label so downstream form props stay non-null.
  const domainOptions = needsDomains.map((d) => ({ domain: d.domain, label: d.label ?? d.domain }));

  return (
    <SurfaceProvider id="wiki.gaps">
      <GapsView
        viewerIsCurator={curator}
        viewerId={userId}
        gaps={JSON.parse(JSON.stringify(gaps))}
        partnerOrgs={partnerOrgs}
        candidateOwners={candidateOwners}
        needsDomains={domainOptions}
      />
    </SurfaceProvider>
  );
}
