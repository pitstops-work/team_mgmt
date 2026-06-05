import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSpineBySlug } from "@/lib/wiki/articles";
import { PanelStackManager } from "../_components/PanelStackManager";

export default async function ElderlyWikiPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <div className="p-6 text-sm text-stone-500">Sign in to view.</div>;
  }

  const spine = await getSpineBySlug("elderly-evrat-v4");
  if (!spine) notFound();

  return <PanelStackManager spine={spine} />;
}
