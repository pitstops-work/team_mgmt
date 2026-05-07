import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import prisma from "@/lib/prisma";
import type { DbPitstop, DbTemplateParam } from "@/lib/templateDb";
import { normalizeActivities } from "@/lib/templateDb";

const TAG_COLORS: Record<string, string> = {
  Team:           "bg-violet-50 text-violet-600 border-violet-200",
  Baseline:       "bg-blue-50 text-blue-600 border-blue-200",
  Permissions:    "bg-amber-50 text-amber-700 border-amber-200",
  Infrastructure: "bg-stone-50 text-stone-600 border-stone-300",
  Monitoring:     "bg-teal-50 text-teal-600 border-teal-200",
  Training:       "bg-sky-50 text-sky-600 border-sky-200",
  Live:           "bg-emerald-50 text-emerald-600 border-emerald-200",
};

function ParamBadge({ param }: { param: DbTemplateParam }) {
  if (param.type === "choice" && param.options) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-stone-700">{param.label}</span>
        <div className="flex gap-1.5 flex-wrap">
          {param.options.map(o => (
            <span key={o.value} className="text-[11px] px-2 py-0.5 rounded-full border border-stone-200 bg-stone-50 text-stone-500">{o.label}</span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <span className="text-xs font-medium text-stone-700">{param.label}</span>
      {param.placeholder && (
        <span className="text-xs text-stone-400 ml-2 italic">{param.placeholder}</span>
      )}
    </div>
  );
}

export default async function PlaybookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const rows = await prisma.$queryRaw<{
    slug: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    parameters: unknown;
    pitstops: unknown;
  }[]>`
    SELECT slug, name, description, category, icon, parameters, pitstops
    FROM "GoalTemplateDef"
    WHERE slug = ${slug} AND "isActive" = true
    LIMIT 1
  `;

  if (!rows[0]) notFound();
  const t = rows[0];
  const params_list = (t.parameters ?? []) as DbTemplateParam[];
  const pitstops = (t.pitstops ?? []) as DbPitstop[];

  // Group pitstops by progressTag for a structured view
  const grouped = pitstops.reduce<Record<string, DbPitstop[]>>((acc, ps) => {
    const tag = ps.progressTag ?? "Live";
    if (!acc[tag]) acc[tag] = [];
    acc[tag].push(ps);
    return acc;
  }, {});
  const TAG_ORDER = ["Team", "Baseline", "Permissions", "Infrastructure", "Training", "Monitoring", "Live"];
  const orderedTags = TAG_ORDER.filter(tag => grouped[tag]);
  // Any tags not in the standard order go at the end
  Object.keys(grouped).forEach(tag => { if (!TAG_ORDER.includes(tag)) orderedTags.push(tag); });

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 sm:pb-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <Link href="/help" className="flex items-center gap-1 text-xs text-stone-400 hover:text-sky-600 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Manual
        </Link>
        <ChevronRight className="w-3 h-3 text-stone-300 flex-shrink-0" />
        <Link href="/help/templates" className="text-xs text-stone-400 hover:text-sky-600 transition-colors">Playbooks</Link>
        <ChevronRight className="w-3 h-3 text-stone-300 flex-shrink-0" />
        <span className="text-xs text-stone-500">{t.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <span className="text-4xl flex-shrink-0">{t.icon}</span>
        <div>
          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-1">{t.category}</p>
          <h1 className="text-xl font-bold text-stone-900">{t.name}</h1>
          <p className="text-sm text-stone-500 mt-1.5 leading-relaxed">{t.description}</p>
        </div>
      </div>

      {/* Setup questions */}
      {params_list.length > 0 && (
        <section className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3">Before you create this goal, you&apos;ll be asked:</p>
          <div className="space-y-3">
            {params_list.map(p => <ParamBadge key={p.key} param={p} />)}
          </div>
        </section>
      )}

      {/* Pitstops */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-stone-800">
            Pitstops <span className="text-stone-400 font-normal">({pitstops.length})</span>
          </h2>
          <span className="text-xs text-stone-400">Grouped by phase</span>
        </div>

        <div className="space-y-6">
          {orderedTags.map(tag => {
            const tagCls = TAG_COLORS[tag] ?? TAG_COLORS.Live;
            return (
              <div key={tag}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${tagCls}`}>{tag}</span>
                  <span className="text-[11px] text-stone-400">{grouped[tag].length} pitstop{grouped[tag].length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2 pl-1">
                  {grouped[tag].map((ps, idx) => {
                    const isRecurring = ps.recurrence && ps.recurrence !== "None";
                    return (
                      <details key={idx} className="group border border-stone-200 rounded-xl overflow-hidden">
                        <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors list-none">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-stone-800">{ps.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-stone-400">{ps.type}</span>
                              {isRecurring ? (
                                <span className="text-[11px] text-violet-500 font-medium">{ps.recurrence}</span>
                              ) : (
                                <span className="text-[11px] text-stone-400">Day {ps.startSlaDays}–{ps.slaDays}</span>
                              )}
                              {ps.checklist.length > 0 && (
                                <span className="text-[11px] text-stone-400">{ps.checklist.length} checklist item{ps.checklist.length !== 1 ? "s" : ""}</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-stone-300 flex-shrink-0 group-open:rotate-90 transition-transform" />
                        </summary>
                        <div className="px-4 pb-4 bg-stone-50 border-t border-stone-100">
                          {ps.notes && (
                            <p className="text-xs text-stone-600 leading-relaxed mt-3 mb-3">{ps.notes}</p>
                          )}
                          {ps.checklist.length > 0 && (
                            <ul className="space-y-3">
                              {ps.checklist.map((ci, ci_idx) => {
                                const activities = normalizeActivities(ci);
                                return (
                                  <li key={ci_idx} className="flex flex-col gap-1">
                                    <div className="flex items-start gap-2 text-xs text-stone-600">
                                      <span className="mt-0.5 w-3 h-3 border border-stone-300 rounded-sm flex-shrink-0" />
                                      <span>{ci.text}</span>
                                    </div>
                                    {activities.length > 0 && (
                                      <ul className="ml-5 space-y-1">
                                        {activities.map((act, ai) => {
                                          const ct = act.completionType || "Activity";
                                          const { label, cls } = ct === "Voice"
                                            ? { label: "Voice", cls: "bg-violet-50 text-violet-600 border-violet-200" }
                                            : ct === "Upload"
                                            ? { label: "Upload", cls: "bg-amber-50 text-amber-600 border-amber-200" }
                                            : { label: "Activity", cls: "bg-sky-50 text-sky-600 border-sky-200" };
                                          return (
                                            <li key={ai} className="flex items-center gap-1.5 text-[11px] text-stone-500">
                                              <span className="text-stone-300">↳</span>
                                              <span>{act.title}</span>
                                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${cls}`}>{label}</span>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-10 pt-6 border-t border-stone-100 flex items-center justify-between">
        <Link href="/help/templates" className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-sky-600 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          All Playbooks
        </Link>
        <Link href="/dashboard" className="text-xs text-sky-500 hover:text-sky-700 hover:underline">
          Create a goal from this template →
        </Link>
      </div>
    </div>
  );
}
