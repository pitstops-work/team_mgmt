import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiSteward, isWikiCurator } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import TranslationQueueView from "./TranslationQueueView";

export default async function TranslationQueuePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [steward, curator] = await Promise.all([
    isWikiSteward(userId),
    isWikiCurator(userId),
  ]);
  if (!steward && !curator) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-600 text-sm">
          Only stewards and curators can access the translation queue.
        </div>
      </main>
    );
  }

  const flags = await prisma.wikiTranslationFlag.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    include: {
      flagger: { select: { id: true, name: true } },
      page: { select: { id: true, slug: true, title: true } },
    },
  });

  return <TranslationQueueView flags={JSON.parse(JSON.stringify(flags))} />;
}
