import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can } from "@/lib/rbac";
import { forbidden, notFound } from "next/navigation";
import { toEngineTemplate } from "@/lib/models/fromPrisma";
import TemplateEditor from "./TemplateEditor";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;
  const ctx = await buildRbacContext(session);
  if (!(await can(ctx, "operating_model_template", "read"))) forbidden();
  const canEdit = await can(ctx, "operating_model_template", "update");

  const t = await prisma.modelTemplate.findUnique({
    where: { id },
    include: {
      groups: { orderBy: { order: "asc" } },
      nodes: { orderBy: { order: "asc" }, include: { group: { select: { key: true } } } },
      outputs: { orderBy: { order: "asc" } },
    },
  });
  if (!t) notFound();
  const template = toEngineTemplate(t);

  return (
    <SurfaceProvider id="models.template_detail">
      <TemplateEditor templateId={t.id} templateKey={t.key} initial={template} canEdit={canEdit} />
    </SurfaceProvider>
  );
}
