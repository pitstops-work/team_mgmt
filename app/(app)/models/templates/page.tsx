import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can } from "@/lib/rbac";
import { forbidden } from "next/navigation";
import Link from "next/link";
import NewTemplateButton from "./NewTemplateButton";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function TemplatesListPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = await buildRbacContext(session);
  if (!(await can(ctx, "operating_model_template", "list"))) forbidden();
  const canEdit = await can(ctx, "operating_model_template", "update");

  const templates = await prisma.modelTemplate.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { nodes: true, outputs: true, instances: true } } },
  });

  return (
    <SurfaceProvider id="models.templates">
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Model templates</h1>
          <p className="text-sm text-stone-500 mt-1">The author layer — edit the structure of each operating model.</p>
        </div>
        {canEdit && <NewTemplateButton />}
      </div>

      <div className="grid gap-3">
        {templates.map(t => (
          <Link
            key={t.id}
            href={`/models/templates/${t.id}`}
            className="bg-white border border-stone-200 rounded-xl p-4 hover:border-sky-300 transition-colors"
          >
            <div className="flex items-baseline justify-between">
              <div>
                <h2 className="font-medium text-stone-900">{t.name}</h2>
                <p className="text-xs text-stone-400 mt-0.5">key: <code>{t.key}</code></p>
              </div>
              <div className="text-xs text-stone-500 flex gap-4">
                <span>{t._count.nodes} nodes</span>
                <span>{t._count.outputs} outputs</span>
                <span>{t._count.instances} instances</span>
                {!t.isActive && <span className="text-amber-600">inactive</span>}
              </div>
            </div>
            {t.description && <p className="text-sm text-stone-500 mt-2">{t.description}</p>}
          </Link>
        ))}
      </div>

      {!canEdit && (
        <p className="mt-6 text-xs text-stone-400">Editing requires admin access.</p>
      )}
    </div>
    </SurfaceProvider>
  );
}
