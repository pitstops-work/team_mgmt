// Public read-only model viewer. Opt-in per instance via ModelInstance.publicSlug.
// No auth — middleware allowlists /models-public/. Sliders are local React state
// only; nothing here writes back to the DB. Path: /models-public/<slug>
//
// `?embed=1` strips the page header + footer + about panel so the view sits
// cleanly inside an iframe.

import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { toEngineTemplate } from "@/lib/models/fromPrisma";
import type { InstanceInputs } from "@/lib/models/types";
import PublicModelView from "./PublicModelView";

export const dynamic = "force-dynamic"; // values reflect prod state on each load

export default async function PublicModelPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { slug } = await params;
  const { embed } = await searchParams;
  const instance = await prisma.modelInstance.findUnique({
    where: { publicSlug: slug },
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

  const template = toEngineTemplate(instance.template);
  const inputs = (instance.inputsJson ?? {}) as InstanceInputs;
  return (
    <PublicModelView
      instanceName={instance.name}
      scenarioName={instance.scenarioName}
      template={template}
      initialInputs={inputs}
      embed={embed === "1"}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const instance = await prisma.modelInstance.findUnique({
    where: { publicSlug: slug },
    select: { name: true, template: { select: { name: true, description: true } } },
  });
  if (!instance) return { title: "Model not found" };
  return {
    title: `${instance.template.name} — operations`,
    description: instance.template.description ?? undefined,
  };
}
