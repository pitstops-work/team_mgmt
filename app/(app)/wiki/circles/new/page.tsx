import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiSteward } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import CircleNewForm from "./CircleNewForm";

export default async function NewCirclePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const steward = await isWikiSteward(userId);
  if (!steward) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-600 text-sm">Only stewards can schedule circles.</div>
      </main>
    );
  }

  const [users, zones, pages] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.zone.findMany({
      where: { deletedAt: null },
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
    <CircleNewForm
      users={JSON.parse(JSON.stringify(users))}
      zones={JSON.parse(JSON.stringify(zones))}
      pages={JSON.parse(JSON.stringify(pages))}
      defaultFacilitatorId={userId}
    />
  );
}
