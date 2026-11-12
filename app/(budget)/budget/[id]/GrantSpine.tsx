"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { GrantSpine as Spine, SpineStage, StageState } from "@/lib/budget/spine";

/**
 * The lifecycle, drawn once, above every screen of a grant.
 *
 * This is the thing that was missing. Each module already existed; what nobody
 * could see was that they were one chain with a position in it. So this is
 * deliberately a spine and not a tab bar — the order is the point, and a tab
 * bar implies the tabs are peers you pick between.
 *
 * A stage with no screen yet is rendered, dimmed and unclickable, with the
 * reason in its tooltip. Hiding it would make the system look more finished
 * than it is, which is the one thing a lifecycle view must not do.
 *
 * Client-side only so it can read the current path: the highlighted stage must
 * be the screen you are actually on. A layout cannot see the pathname, and
 * highlighting the computed "active" stage while the reader sits on Reporting
 * would quietly contradict the page under it.
 */

const DOT: Record<StageState, string> = {
  done: "bg-emerald-500",
  active: "bg-sky-500 ring-2 ring-sky-200",
  blocked: "bg-amber-500",
  pending: "bg-stone-300",
  skipped: "bg-stone-200",
  unknown: "bg-stone-400",
};

const TEXT: Record<StageState, string> = {
  done: "text-stone-600",
  active: "text-sky-700 font-medium",
  blocked: "text-amber-800 font-medium",
  pending: "text-stone-400",
  skipped: "text-stone-300",
  unknown: "text-stone-400",
};

const STATE_WORD: Record<StageState, string> = {
  done: "done",
  active: "in progress",
  blocked: "blocked",
  pending: "not started",
  skipped: "does not apply",
  unknown: "cannot tell",
};

function StageChip({ stage, isCurrent }: { stage: SpineStage; isCurrent: boolean }) {
  // The tooltip carries the state word and the blockers, so hovering a dimmed
  // stage says why rather than leaving the reader to guess.
  const title = [
    `${stage.label} — ${STATE_WORD[stage.state]}`,
    stage.summary,
    ...stage.blockers,
    stage.href ? null : "No screen for this stage yet.",
  ]
    .filter(Boolean)
    .join("\n");

  const inner = (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[stage.state]}`} />
      <span className={`text-xs ${TEXT[stage.state]}`}>{stage.label}</span>
      {stage.badge ? (
        <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800">
          {stage.badge}
        </span>
      ) : null}
    </span>
  );

  const base = "rounded px-2 py-1 transition-colors";
  const current = isCurrent ? " bg-white shadow-sm ring-1 ring-stone-200" : "";

  if (!stage.href) {
    return (
      <span className={`${base}${current} cursor-default opacity-70`} title={title}>
        {inner}
      </span>
    );
  }
  return (
    <Link href={stage.href} className={`${base}${current} hover:bg-white`} title={title}>
      {inner}
    </Link>
  );
}

export default function GrantSpine({
  spine,
  currentKey,
  extraLinks,
}: {
  spine: Spine;
  /** The stage whose screen the reader is on, if any. */
  currentKey?: string | null;
  extraLinks?: { label: string; href: string }[];
}) {
  const pathname = usePathname();
  // The stage whose screen this is, by href. Several stages can share a screen
  // (the appraisal note and its judgement are both the wizard), so the first
  // match wins and the order of ORDER decides — which is the reading order.
  const byPath = spine.stages.find((s) => s.href && s.href === pathname);
  const activeKey = currentKey ?? byPath?.key ?? spine.activeKey;
  const current = spine.stages.find((s) => s.key === activeKey);

  return (
    <div className="mb-6 rounded-lg border border-stone-200 bg-stone-50/70">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-stone-200 px-3 py-2">
        <Link href={`/budget/${spine.budgetId}`} className="text-sm font-semibold text-stone-800 hover:underline">
          {spine.name}
        </Link>
        {spine.granteeName && <span className="text-xs text-stone-500">{spine.granteeName}</span>}
        <span className="ml-auto text-xs tabular-nums text-stone-400">
          {spine.progress.done} of {spine.progress.total} stages done
        </span>
      </div>

      <nav className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5">
        {spine.stages.map((s, i) => (
          <span key={s.key} className="flex items-center">
            {i > 0 && <span className="mx-0.5 h-px w-2 shrink-0 bg-stone-300" />}
            <StageChip stage={s} isCurrent={s.key === activeKey} />
          </span>
        ))}
        {extraLinks?.map((l) => (
          <span key={l.href} className="flex items-center">
            <span className="mx-1 h-3 w-px shrink-0 bg-stone-300" />
            <Link
              href={l.href}
              className="whitespace-nowrap rounded px-2 py-1 text-xs text-stone-400 hover:bg-white hover:text-stone-700"
            >
              {l.label}
            </Link>
          </span>
        ))}
      </nav>

      {current && (current.summary || current.blockers.length > 0) && (
        <div className="border-t border-stone-200 px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className="uppercase tracking-wide text-stone-400">{current.label}</span>
            {current.summary && <span className="text-stone-600">{current.summary}</span>}
          </div>
          {current.blockers.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {current.blockers.map((b, i) => (
                <li key={i} className="text-xs text-amber-800">
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
