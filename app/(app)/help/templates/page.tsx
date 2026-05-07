import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import prisma from "@/lib/prisma";

export default async function PlaybooksIndexPage() {
  const rows = await prisma.$queryRaw<{
    slug: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    pitstops: unknown;
  }[]>`
    SELECT slug, name, description, category, icon, pitstops
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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-24 sm:pb-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/help" className="flex items-center gap-1 text-xs text-stone-400 hover:text-sky-600 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Manual
        </Link>
        <ChevronRight className="w-3 h-3 text-stone-300" />
        <span className="text-xs text-stone-500">Programme Playbooks</span>
      </div>

      <div className="mb-8">
        <h1 className="text-xl font-bold text-stone-900">Programme Playbooks</h1>
        <p className="text-sm text-stone-500 mt-1 leading-relaxed">
          Each playbook is a structured guide for a programme — covering what pitstops to create, what the checklists look like, and what questions to answer when setting up.
        </p>
      </div>

      <div className="space-y-8">
        {Object.entries(byCategory).map(([category, templates]) => (
          <section key={category}>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3 pb-2 border-b border-stone-100">
              {category}
            </p>
            <div className="space-y-2">
              {templates.map(t => {
                const pitstops = Array.isArray(t.pitstops) ? t.pitstops : [];
                return (
                  <Link
                    key={t.slug}
                    href={`/help/templates/${t.slug}`}
                    className="flex items-center gap-4 px-4 py-4 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-xl transition-all group"
                  >
                    <span className="text-2xl flex-shrink-0">{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-900 group-hover:text-sky-700 transition-colors">{t.name}</p>
                      <p className="text-xs text-stone-500 mt-0.5 line-clamp-2 leading-relaxed">{t.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[11px] text-stone-400">{pitstops.length} pitstop{pitstops.length !== 1 ? "s" : ""}</span>
                      <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-sky-400 transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
