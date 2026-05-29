import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiCurator } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import GapsView from "./GapsView";

export default async function WikiGapsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const curator = await isWikiCurator(userId);

  // Curators see every open + assigned + drafted gap.
  // Non-curators see gaps they filed or were assigned, plus a "file new" form.
  const gaps = await prisma.wikiPracticeGap.findMany({
    where: curator
      ? { resolvedAt: null }
      : { OR: [{ filerId: userId }, { assignedOwnerId: userId }] },
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
  const [partnerOrgs, candidateOwners] = curator
    ? await Promise.all([
        prisma.org.findMany({
          where: { kind: "partner" },
          orderBy: { name: "asc" },
          select: { id: true, name: true, slug: true },
        }),
        prisma.user.findMany({
          where: { ownedWikiPages: { some: { archivedAt: null } } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        }),
      ])
    : [[], []];

  return (
    <GapsView
      viewerIsCurator={curator}
      viewerId={userId}
      gaps={JSON.parse(JSON.stringify(gaps))}
      partnerOrgs={partnerOrgs}
      candidateOwners={candidateOwners}
    />
  );
}
