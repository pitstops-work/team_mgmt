import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can } from "@/lib/rbac";
import { forbidden } from "next/navigation";
import Link from "next/link";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function ModelsListPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ctx = await buildRbacContext(session);
  if (!(await can(ctx, "operating_model", "list"))) forbidden();
  const canEditTemplates = await can(ctx, "operating_model_template", "update");

  const templates = await prisma.modelTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      instances: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, scenarioName: true, updatedAt: true, pitstopId: true },
      },
      _count: { select: { nodes: true } },
    },
  });

  // Instances opted into the public read-only viewer (ModelInstance.publicSlug).
  // Rendered as shareable demos; new publishes surface here automatically.
  const publicDemos = await prisma.modelInstance.findMany({
    where: { publicSlug: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, scenarioName: true, publicSlug: true, template: { select: { name: true } } },
  });

  return (
    <SurfaceProvider id="models.list">
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900 mb-1">Models</h1>
          <p className="text-sm text-stone-500">
            Parametric unit-economics models. Templates are editable; each instance is a scenario you can play with.
          </p>
        </div>
        {canEditTemplates && (
          <Link href="/models/templates" className="text-sm text-stone-500 hover:text-stone-900">
            Edit templates →
          </Link>
        )}
      </div>

      {publicDemos.length > 0 && (
        <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="font-medium text-emerald-900">Public demos</h2>
            <span className="text-xs text-emerald-700/70">Shareable · read-only · no login</span>
          </div>
          <p className="text-sm text-emerald-800/80 mb-3">
            Standalone day-in-the-life + finance simulators anyone can open. Sliders are live but never saved.
            Add <code className="bg-white/70 px-1 rounded">?embed=1</code> to any link to drop it in an iframe.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {publicDemos.map(d => (
              <a
                key={d.id}
                href={`/models-public/${d.publicSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 rounded-lg bg-white border border-emerald-200 px-4 py-3 hover:border-emerald-400 hover:shadow-sm transition-all"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-900 truncate">{d.template.name}</div>
                  <div className="text-xs text-stone-400 truncate">
                    /models-public/{d.publicSlug}{d.scenarioName ? ` · ${d.scenarioName}` : ""}
                  </div>
                </div>
                <span className="text-emerald-600 group-hover:translate-x-0.5 transition-transform shrink-0">↗</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {templates.length === 0 && (
        <div className="text-center py-20 text-stone-400 text-sm">
          No templates yet. Run <code className="bg-stone-100 px-1 rounded">npx tsx prisma/seed-operating-model-toy.ts</code>.
        </div>
      )}

      <div className="grid gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-white border border-stone-200 rounded-xl p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium text-stone-900">{t.name}</h2>
              <span className="text-xs text-stone-400">{t._count.nodes} nodes</span>
            </div>
            {t.description && <p className="text-sm text-stone-500 mt-1">{t.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {t.instances.map(i => (
                <Link
                  key={i.id}
                  href={`/models/${i.id}`}
                  className="text-xs px-3 py-1.5 rounded-full bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-100"
                >
                  {i.name}{i.scenarioName ? ` — ${i.scenarioName}` : ""}
                </Link>
              ))}
              {t.instances.length === 0 && (
                <span className="text-xs text-stone-400">No instances yet.</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
    </SurfaceProvider>
  );
}
