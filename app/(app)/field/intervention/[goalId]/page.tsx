import { redirect, notFound } from "next/navigation";
import { resolveFieldView } from "@/lib/field/viewAs";
import { loadIntervention } from "@/lib/field/queries";
import { InterventionDetail } from "./_components/InterventionDetail";

export const dynamic = "force-dynamic";

// Screen 3 — one intervention: setup steps OR the live visit, plus follow-ups.
export default async function InterventionPage({
  params,
  searchParams,
}: {
  params: Promise<{ goalId: string }>;
  searchParams: Promise<{ asUser?: string }>;
}) {
  const { asUser } = await searchParams;
  const view = await resolveFieldView(asUser);
  if (!view) redirect("/operations");
  const { goalId } = await params;
  const data = await loadIntervention(goalId);
  if (!data) notFound();

  // Serialize dates to ISO for the client boundary.
  return (
    <InterventionDetail
      data={JSON.parse(JSON.stringify(data))}
      // An admin preview must not write: the mutation would run as the admin,
      // not as the previewed RP.
      previewOf={view.viewingAs ? view.viewingAs.name : null}
      readOnly={!!view.viewingAs}
    />
  );
}
