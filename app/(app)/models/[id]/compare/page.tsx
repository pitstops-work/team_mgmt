import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can } from "@/lib/rbac";
import { forbidden, notFound } from "next/navigation";
import Link from "next/link";
import { toEngineTemplate } from "@/lib/models/fromPrisma";
import { compute } from "@/lib/models/engine";
import type { InstanceInputs, NodeValue } from "@/lib/models/types";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

const fmtINR = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};
const fmtNum = (n: number) => Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—";
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const formatScalar = (v: NodeValue | undefined, format: string | undefined): string => {
  if (v === undefined || v === null) return "—";
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (format === "currency") return fmtINR(v as number);
  if (format === "percent") return fmtPct(v as number);
  return fmtNum(v as number);
};

export default async function CompareScenariosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;
  const ctx = await buildRbacContext(session);
  if (!(await can(ctx, "operating_model", "read"))) forbidden();

  // Resolve the head instance (could be the parent of `id`, or `id` itself if
  // already the head).
  const seed = await prisma.modelInstance.findUnique({
    where: { id },
    select: { id: true, parentInstanceId: true, templateId: true },
  });
  if (!seed) notFound();
  const headId = seed.parentInstanceId ?? seed.id;

  const [siblings, templateRow] = await Promise.all([
    prisma.modelInstance.findMany({
      where: { OR: [{ id: headId }, { parentInstanceId: headId }] },
      orderBy: [{ scenarioName: "asc" }, { createdAt: "asc" }],
    }),
    prisma.modelTemplate.findUnique({
      where: { id: seed.templateId },
      include: {
        groups: { orderBy: { order: "asc" } },
        nodes: { orderBy: { order: "asc" }, include: { group: { select: { key: true } } } },
        outputs: { orderBy: { order: "asc" } },
      },
    }),
  ]);
  if (!templateRow) notFound();
  const template = toEngineTemplate(templateRow);

  // Compute each scenario independently.
  const computed = siblings.map(s => ({
    instance: s,
    result: compute(template, (s.inputsJson ?? {}) as InstanceInputs),
  }));

  const kpiOutputs = template.outputs.filter(o => o.kind === "kpi");

  return (
    <SurfaceProvider id="models.compare">
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Compare scenarios</h1>
          <p className="text-sm text-stone-500 mt-1">{template.name}</p>
        </div>
        <Link href={`/models/${headId}`} className="text-sm text-stone-500 hover:text-stone-700">← Back</Link>
      </div>

      <div className="overflow-x-auto bg-white border border-stone-200 rounded-xl">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wide">KPI</th>
              {computed.map(c => (
                <th key={c.instance.id} className="px-4 py-3 text-right text-xs font-medium text-stone-700">
                  <Link href={`/models/${c.instance.id}`} className="hover:underline">
                    {c.instance.scenarioName ?? c.instance.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpiOutputs.map(o => {
              const cfg = o.config as { nodeKey?: string; index?: number; format?: string };
              const values = computed.map(c => {
                const v = cfg.nodeKey ? c.result.values[cfg.nodeKey] : undefined;
                return Array.isArray(v) ? v[cfg.index ?? 0] : v;
              });
              const numerics = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
              const max = numerics.length ? Math.max(...numerics) : undefined;
              const min = numerics.length ? Math.min(...numerics) : undefined;
              return (
                <tr key={o.key} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-2 text-stone-700">{o.label}</td>
                  {values.map((v, i) => {
                    const highlight = typeof v === "number" && numerics.length > 1
                      ? v === max ? "bg-emerald-50 font-medium" : v === min ? "bg-rose-50" : ""
                      : "";
                    return (
                      <td key={i} className={`px-4 py-2 text-right tabular-nums ${highlight}`}>
                        {formatScalar(v, cfg.format)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-stone-400">
        Green = best in row · red = worst · blank = single scenario / non-numeric.
      </p>
    </div>
    </SurfaceProvider>
  );
}
