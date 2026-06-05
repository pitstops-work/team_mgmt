import { auth } from "@/lib/auth";
import { getProgrammeBadges } from "@/lib/wiki/articles";
import { ProgramBadgesGrid } from "./_components/ProgramBadgesGrid";

/**
 * Wiki landing (v2). Programme-organised reference content. Each programme
 * with a spine is a live entry; others are stubs.
 *
 * Replaces the previous WikiListView (legacy wiki models + routes still
 * exist for direct URL access — see /wiki/[slug], /wiki/circles, etc.).
 */
export default async function WikiIndexPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <div className="p-6 text-sm text-stone-500">Sign in to view the wiki.</div>;
  }

  const badges = await getProgrammeBadges();
  return <ProgramBadgesGrid badges={badges} />;
}
