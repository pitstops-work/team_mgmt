import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import WikiNewForm from "./WikiNewForm";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function WikiNewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const steward = await isWikiSteward(userId);
  if (!steward) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-600 text-sm">
          Only stewards can create wiki pages.
        </div>
      </main>
    );
  }

  const users = await prisma.user.findMany({
    where: { lastSeenAt: { not: null } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <SurfaceProvider id="wiki.new">
      <WikiNewForm users={JSON.parse(JSON.stringify(users))} />
    </SurfaceProvider>
  );
}
