"use client";

import { Fragment } from "react";
import { BookOpenIcon, ClipboardListIcon, HandshakeIcon } from "lucide-react";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import type { Panel, SpineWithEntries } from "@/lib/wiki/articles";

export type SpinePanelProps = {
  spine: SpineWithEntries;
  onOpenFork: (questionArticleId: string, questionTitle: string, panel: Panel) => void;
  activePanels: { questionArticleId: string; panel: Panel }[];
};

const PANEL_META: { panel: Panel; label: string; icon: typeof BookOpenIcon; bg: string; ring: string }[] = [
  { panel: "guideline",     label: "Guideline",     icon: BookOpenIcon,      bg: "bg-sky-100 text-sky-800 hover:bg-sky-200",         ring: "ring-sky-400" },
  { panel: "care_plan",     label: "Care plan",     icon: ClipboardListIcon, bg: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200", ring: "ring-emerald-400" },
  { panel: "action_manual", label: "Action manual", icon: HandshakeIcon,     bg: "bg-amber-100 text-amber-800 hover:bg-amber-200",   ring: "ring-amber-400" },
];

export function SpinePanel({ spine, onOpenFork, activePanels }: SpinePanelProps) {
  const isActive = (questionArticleId: string, panel: Panel) =>
    activePanels.some((p) => p.questionArticleId === questionArticleId && p.panel === panel);

  return (
    <SurfaceProvider id="wiki.elderly_spine">
      <div className="flex h-full w-full shrink-0 snap-start flex-col border-r border-stone-200 bg-white sm:w-[480px]">
        <header className="border-b border-stone-200 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wide text-stone-500">Spine</div>
          <h1 className="text-lg font-semibold text-stone-900">{spine.title}</h1>
        </header>

        <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
          {spine.entries.map((entry, idx) => {
            const showHeader = !!entry.sectionLabel || idx === 0;
            return (
              <Fragment key={entry.id}>
                {entry.sectionLabel && (
                  <div className="bg-stone-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                    {entry.sectionLabel}
                  </div>
                )}
                <div className="px-4 py-3">
                  <div className="mb-2 text-sm font-medium text-stone-900">{entry.article.title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PANEL_META.map(({ panel, label, icon: Icon, bg, ring }) => {
                      const count = entry.article.linkCounts[panel];
                      const active = isActive(entry.article.id, panel);
                      return (
                        <button
                          key={panel}
                          type="button"
                          onClick={() => onOpenFork(entry.article.id, entry.article.title, panel)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${bg} ${active ? `ring-2 ${ring}` : ""}`}
                          title={`${label} — ${count} article${count === 1 ? "" : "s"}`}
                        >
                          <Icon className="h-3 w-3" />
                          {label}
                          {count > 0 && (
                            <span className="ml-0.5 rounded-full bg-white/60 px-1 text-[10px]">{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Fragment>
            );
          })}
          {spine.entries.length === 0 && (
            <div className="p-6 text-sm text-stone-500">Spine is empty.</div>
          )}
        </div>
      </div>
    </SurfaceProvider>
  );
}
