import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import prisma from "@/lib/prisma";
import type { DbPitstop, DbTemplateParam } from "@/lib/templateDb";

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
      <div className="flex flex-col gap-1">
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

export default async function TemplatesWikiPage() {
  const rows = await prisma.$queryRaw<{
    slug: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    needsDomain: string | null;
    parameters: unknown;
    pitstops: unknown;
  }[]>`
    SELECT slug, name, description, category, icon, "needsDomain", parameters, pitstops
    FROM "GoalTemplateDef"
    WHERE "isActive" = true
    ORDER BY "sortOrder" ASC, name ASC
  `;

  const byCategory = rows.reduce<Record<string, typeof rows>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24 sm:pb-8">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/help" className="flex items-center gap-1 text-xs text-stone-400 hover:text-sky-600 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Manual
        </Link>
        <ChevronRight className="w-3 h-3 text-stone-300" />
        <span className="text-xs text-stone-500">Programme Playbooks</span>
      </div>

      <div className="mb-8 mt-4">
        <h1 className="text-xl font-bold text-stone-900">Programme Playbooks</h1>
        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
          Each template below is a structured playbook — a curated set of pitstops, checklists, and activities based on how we run programmes on the ground. Use these when creating a new goal from a template.
        </p>
      </div>

      <div className="space-y-12">
        {Object.entries(byCategory).map(([category, templates]) => (
          <section key={category}>
            <h2 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-5 pb-2 border-b border-stone-100">
              {category}
            </h2>
            <div className="space-y-8">
              {templates.map(t => {
                const params = (t.parameters ?? []) as DbTemplateParam[];
                const pitstops = (t.pitstops ?? []) as DbPitstop[];

                return (
                  <div key={t.slug} className="group">
                    {/* Template header */}
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-2xl flex-shrink-0 mt-0.5">{t.icon}</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-stone-900">{t.name}</h3>
                        <p className="text-sm text-stone-500 leading-relaxed mt-0.5">{t.description}</p>
                      </div>
                    </div>

                    {/* Parameters */}
                    {params.length > 0 && (
                      <div className="ml-9 mb-4">
                        <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-2">Setup questions</p>
                        <div className="space-y-2">
                          {params.map(p => <ParamBadge key={p.key} param={p} />)}
                        </div>
                      </div>
                    )}

                    {/* Pitstops */}
                    {pitstops.length > 0 && (
                      <div className="ml-9">
                        <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-2">
                          Pitstops created ({pitstops.length})
                        </p>
                        <div className="space-y-2">
                          {pitstops.map((ps, idx) => {
                            const tagCls = TAG_COLORS[ps.progressTag ?? "Live"] ?? TAG_COLORS.Live;
                            const isRecurring = ps.recurrence && ps.recurrence !== "None";
                            return (
                              <details key={idx} className="group/ps border border-stone-200 rounded-xl overflow-hidden">
                                <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors list-none">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-medium text-stone-800">{ps.title}</span>
                                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${tagCls}`}>
                                        {ps.progressTag ?? "Live"}
                                      </span>
                                      {isRecurring && (
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-violet-50 text-violet-600 border-violet-200">
                                          {ps.recurrence}
                                        </span>
                                      )}
                                      <span className="text-[10px] text-stone-400">{ps.type}</span>
                                    </div>
                                    {!isRecurring && (
                                      <p className="text-[11px] text-stone-400 mt-0.5">
                                        Day {ps.startSlaDays}–{ps.slaDays}
                                      </p>
                                    )}
                                  </div>
                                  <ChevronRight className="w-3.5 h-3.5 text-stone-300 flex-shrink-0 group-open/ps:rotate-90 transition-transform" />
                                </summary>
                                <div className="px-4 pb-4 bg-stone-50 border-t border-stone-100">
                                  {ps.notes && (
                                    <p className="text-xs text-stone-600 leading-relaxed mt-3 mb-3">{ps.notes}</p>
                                  )}
                                  {ps.checklist.length > 0 && (
                                    <ul className="space-y-1">
                                      {ps.checklist.map((ci, ci_idx) => (
                                        <li key={ci_idx} className="flex items-start gap-2 text-xs text-stone-500">
                                          <span className="mt-0.5 w-3 h-3 border border-stone-300 rounded-sm flex-shrink-0" />
                                          {ci.text}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-12 pt-6 border-t border-stone-100 flex items-center justify-between">
        <Link href="/help" className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-sky-600 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Manual
        </Link>
        <Link
          href="/dashboard"
          className="text-xs text-sky-500 hover:text-sky-700 hover:underline"
        >
          Create a goal from template →
        </Link>
      </div>
    </div>
  );
}
