import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess, canEditPlan, canViewPlan } from "@/lib/schoolPlan/access";
import StepsClient from "../_components/StepsClient";

export default async function StepsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!canViewPlan(access, id)) redirect("/schools");

  const plan = await prisma.schoolPlan.findUnique({
    where: { id },
    select: {
      id: true, name: true,
      steps: {
        orderBy: { stepNo: "asc" },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          substeps: {
            orderBy: { position: "asc" },
            include: { owner: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });
  if (!plan) notFound();

  // Team pool for the assignee dropdown — plan members + super-admins.
  const users = await prisma.user.findMany({
    where: { role: { in: ["member", "admin", "super-admin"] } },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, email: true },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Link href={`/schools/${id}`} className="hover:text-stone-700">← {plan.name}</Link>
      </div>
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">Step tracker</h1>
          <p className="text-xs text-stone-500 mt-0.5">16 steps · owner, due date, status per school</p>
        </div>
      </div>
      <StepsClient
        steps={plan.steps.map((s) => ({
          id: s.id,
          stepNo: s.stepNo,
          title: s.title,
          description: s.description,
          planSection: s.planSection,
          requiredArtifactType: s.requiredArtifactType,
          status: s.status,
          ownerUserId: s.ownerUserId,
          ownerLabel: s.owner ? (s.owner.name ?? s.owner.email) : null,
          dueDate: s.dueDate?.toISOString() ?? null,
          blockingNote: s.blockingNote,
          substeps: s.substeps.map((ss) => ({
            id: ss.id,
            title: ss.title,
            description: ss.description,
            status: ss.status,
            ownerUserId: ss.ownerUserId,
            ownerLabel: ss.owner ? (ss.owner.name ?? ss.owner.email) : null,
            dueDate: ss.dueDate?.toISOString() ?? null,
            blockingNote: ss.blockingNote,
          })),
        }))}
        users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
        canEdit={canEditPlan(access, id)}
      />
    </div>
  );
}
