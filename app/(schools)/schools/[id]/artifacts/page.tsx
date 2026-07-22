import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess, canEditPlan, canViewPlan } from "@/lib/schoolPlan/access";
import ArtifactsClient from "../_components/ArtifactsClient";

const ARTIFACT_KINDS = [
  "survey_drawing", "photo", "map", "architect_design", "vendor_quote",
  "budget_working", "permission_letter", "partner_agreement", "other",
];

export default async function ArtifactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!canViewPlan(access, id)) redirect("/schools");

  const plan = await prisma.schoolPlan.findUnique({
    where: { id },
    select: {
      id: true, name: true,
      artifacts: {
        orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
        include: { uploadedBy: { select: { name: true, email: true } } },
      },
      steps: { orderBy: { stepNo: "asc" }, select: { id: true, stepNo: true, title: true, requiredArtifactType: true } },
    },
  });
  if (!plan) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Link href={`/schools/${id}`} className="hover:text-stone-700">← {plan.name}</Link>
      </div>
      <div>
        <h1 className="text-lg font-semibold text-stone-900">Artifacts</h1>
        <p className="text-xs text-stone-500 mt-0.5">Survey drawings, photos, maps, architect designs, vendor quotes, letters, agreements.</p>
      </div>
      <ArtifactsClient
        planId={id}
        canEdit={canEditPlan(access, id)}
        kinds={ARTIFACT_KINDS}
        steps={plan.steps}
        artifacts={plan.artifacts.map((a) => ({
          id: a.id, kind: a.kind, name: a.name, url: a.url, size: a.size,
          caption: a.caption, stepId: a.stepId,
          uploadedBy: a.uploadedBy?.name ?? a.uploadedBy?.email ?? null,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
