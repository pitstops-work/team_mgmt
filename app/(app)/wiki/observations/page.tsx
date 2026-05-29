import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import ObservationsView from "./ObservationsView";

export default async function WikiObservationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // Anyone signed in can view & record. List shows latest 200 across the team
  // so an owner can see what's happening on their domain without owning every
  // observation themselves.
  const [observations, partnerOrgs, pageOptions] = await Promise.all([
    prisma.wikiPracticeObservation.findMany({
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
  ]);

  return (
    <ObservationsView
      viewerId={userId}
      observations={JSON.parse(JSON.stringify(observations))}
      partnerOrgs={partnerOrgs}
      pageOptions={pageOptions}
    />
  );
}
