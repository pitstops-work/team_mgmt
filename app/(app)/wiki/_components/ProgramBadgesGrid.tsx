"use client";

import Link from "next/link";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import type { ProgrammeBadge } from "@/lib/wiki/articles";

export function ProgramBadgesGrid({ badges }: { badges: ProgrammeBadge[] }) {
  // Sort: live first, then stubs alphabetically.
  const sorted = [...badges].sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return (
    <SurfaceProvider id="wiki.programs">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-stone-900">Wiki</h1>
          <p className="mt-1 text-sm text-stone-600">
            Field reference, organised by programme. Open a programme to walk its assessment and pull guidelines, care plans, and action manuals for each question.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((b) => (
            <ProgrammeBadge key={b.domain} badge={b} />
          ))}
          {sorted.length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-stone-300 p-6 text-sm text-stone-500">
              No programmes configured yet.
            </div>
          )}
        </div>
      </div>
    </SurfaceProvider>
  );
}

function ProgrammeBadge({ badge }: { badge: ProgrammeBadge }) {
  // Hard-coded mapping for the one live programme. Other programmes are stubs
  // until their spine + content lands.
  const route = badge.domain === "Elderly" && badge.isLive ? "/wiki/elderly" : null;

  const Inner = (
    <div className={`flex h-32 flex-col justify-between rounded-lg border p-4 transition ${
      badge.isLive
        ? "border-amber-200 bg-amber-50 hover:border-amber-400 hover:bg-amber-100"
        : "border-stone-200 bg-stone-50 text-stone-400"
    }`}>
      <div className="font-medium">{badge.label}</div>
      <div className="text-xs">
        {badge.isLive ? `${badge.articleCount} articles · open →` : "Coming soon"}
      </div>
    </div>
  );

  if (route) {
    return <Link href={route} className="block">{Inner}</Link>;
  }
  return <div className="cursor-not-allowed">{Inner}</div>;
}
