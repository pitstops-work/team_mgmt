"use client";

/**
 * PlanMonthCTA — small inviting link to /visits, surfaced on every role's
 * Today tab. Sky-tinted banner with a one-line prompt + chevron. Designed to
 * sit between the AP section and the activity sections; quiet enough not to
 * compete with active work but visible enough that the planner is discoverable
 * for an RP who hasn't found the setup-nav entry yet.
 *
 * Same component on all four tabs to keep the framing consistent.
 */

import Link from "next/link";
import { CalendarRange, ChevronRight } from "lucide-react";

export function PlanMonthCTA() {
  return (
    <Link
      href="/visits"
      className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-sky-200 bg-sky-50/60 hover:bg-sky-50 hover:border-sky-300 transition-colors"
    >
      <CalendarRange className="w-4 h-4 text-sky-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-sky-800">Plan your month</p>
        <p className="text-[11px] text-sky-600/80 leading-snug">
          See and rearrange your visits on a month grid — drag a card onto another day to reschedule the whole pitstop.
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-sky-400 group-hover:text-sky-700 flex-shrink-0" />
    </Link>
  );
}
