import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiCurator } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import ObservationsView from "./ObservationsView";

export default async function WikiObservationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const viewerIsCurator = await isWikiCurator(userId);

  // Anyone signed in can view & record. List shows latest 200 across the team
  // so an owner can see what's happening on their domain without owning every
  // observation themselves.
  const [observations, partnerOrgs, pageOptions, needsDomains] = await Promise.all([
    prisma.wikiPracticeObservation.findMany({
      where: { archivedAt: null },
      orderBy: { happenedAt: "desc" },
      take: 200,
      include: {
        observer: { select: { id: true, name: true } },
        observed: { select: { id: true, name: true } },
        partnerOrg: { select: { id: true, name: true } },
        primaryPage: { select: { id: true, slug: true, title: true } },
      },
    }),
    prisma.org.findMany({
      where: { kind: "partner" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.wikiPage.findMany({
      where: { archivedAt: null, status: { not: "retired" } },
      orderBy: { title: "asc" },
      select: { id: true, slug: true, title: true, type: true },
    }),
    prisma.needsFormulaConfig.findMany({
      where: { isActive: true },
      select: { domain: true, label: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  // Coalesce nullable label so downstream form props stay non-null.
  const domainOptions = needsDomains.map((d) => ({ domain: d.domain, label: d.label ?? d.domain }));

  return (
    <ObservationsView
      viewerId={userId}
      viewerIsCurator={viewerIsCurator}
      observations={JSON.parse(JSON.stringify(observations))}
      partnerOrgs={partnerOrgs}
      pageOptions={pageOptions}
      needsDomains={domainOptions}
    />
  );
}
