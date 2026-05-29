import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can } from "@/lib/rbac";
import { forbidden, notFound } from "next/navigation";
import { toEngineTemplate } from "@/lib/models/fromPrisma";
import type { InstanceInputs } from "@/lib/models/types";
import PlayWorkbench from "./PlayWorkbench";

export default async function ModelPlayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;
  const ctx = await buildRbacContext(session);
  if (!(await can(ctx, "operating_model", "read"))) forbidden();

  const instance = await prisma.modelInstance.findUnique({
    where: { id },
    include: {
      template: {
        include: {
          groups: { orderBy: { order: "asc" } },
          nodes: { orderBy: { order: "asc" }, include: { group: { select: { key: true } } } },
          outputs: { orderBy: { order: "asc" } },
        },
      },
    },
  });
  if (!instance) notFound();

  const headId = instance.parentInstanceId ?? instance.id;
  const siblings = await prisma.modelInstance.findMany({
    where: { OR: [{ id: headId }, { parentInstanceId: headId }] },
    select: { id: true, name: true, scenarioName: true, updatedAt: true },
    orderBy: [{ scenarioName: "asc" }, { createdAt: "asc" }],
  });

  // If attached, pull the pitstop + its settlement profile to enable prefill.
  let attachedPitstop: {
    id: string; title: string; goalTitle: string | null;
    settlement: { id: string; name: string; totalHouseholds: number; children6m3yr: number; children4to14: number; youth15to21: number; elderly60plus: number } | null;
  } | null = null;
  if (instance.pitstopId) {
    const p = await prisma.pitstop.findUnique({
      where: { id: instance.pitstopId },
      select: {
        id: true, title: true, goal: { select: { title: true } },
        needsSettlement: { select: { id: true, name: true, profile: true } },
      },
    });
    if (p) {
      attachedPitstop = {
        id: p.id, title: p.title, goalTitle: p.goal?.title ?? null,
        settlement: p.needsSettlement?.profile
          ? {
              id: p.needsSettlement.id, name: p.needsSettlement.name,
              totalHouseholds: p.needsSettlement.profile.totalHouseholds,
              children6m3yr: p.needsSettlement.profile.children6m3yr,
              children4to14: p.needsSettlement.profile.children4to14,
              youth15to21: p.needsSettlement.profile.youth15to21,
              elderly60plus: p.needsSettlement.profile.elderly60plus,
            }
          : null,
      };
    }
  }

  const template = toEngineTemplate(instance.template);
  const inputs = (instance.inputsJson ?? {}) as InstanceInputs;

  return (
    <PlayWorkbench
      instanceId={instance.id}
      instanceName={instance.name}
      scenarioName={instance.scenarioName}
      template={template}
      initialInputs={inputs}
      siblings={siblings.length > 1 ? siblings : null}
      headId={headId}
      attachedPitstop={attachedPitstop}
    />
  );
}
