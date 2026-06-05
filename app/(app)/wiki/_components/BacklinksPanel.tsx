"use client";

import Link from "next/link";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import type { ArticleSummary, Panel } from "@/lib/wiki/articles";

const PANEL_LABEL: Record<Panel, string> = {
  guideline: "Guideline",
  care_plan: "Care plan",
  action_manual: "Action manual",
};

export function BacklinksPanel({
  backlinks,
}: {
  backlinks: { article: ArticleSummary; panel: Panel }[];
}) {
  if (backlinks.length === 0) {
    return (
      <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-xs text-stone-500">
        Not linked from any spine entry yet.
      </div>
    );
  }
  // Group by question
  const byQuestion = new Map<string, { article: ArticleSummary; panels: Panel[] }>();
  for (const bl of backlinks) {
    const existing = byQuestion.get(bl.article.id);
    if (existing) existing.panels.push(bl.panel);
    else byQuestion.set(bl.article.id, { article: bl.article, panels: [bl.panel] });
  }
  return (
    <SurfaceProvider id="wiki.article_view">
      <div className="rounded-md border border-stone-200 bg-white p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Appears on {byQuestion.size} question{byQuestion.size === 1 ? "" : "s"}
        </h2>
        <ul className="space-y-1.5">
          {[...byQuestion.values()].map(({ article, panels }) => (
            <li key={article.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/wiki/a/${article.slug}`} className="text-amber-700 hover:underline">
                {article.title}
              </Link>
              <div className="flex shrink-0 gap-1">
                {panels.map((p) => (
                  <span key={p} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
                    {PANEL_LABEL[p]}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </SurfaceProvider>
  );
}
