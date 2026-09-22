"use client";

import { MapPin, Star } from "lucide-react";

export type LocationOption = { id: string; city: string; state: string | null };

/**
 * Pick the cities a JD runs in, plus which one is PRIMARY.
 *
 * The primary drives the JD slug and is the default city at generate time, so
 * it can never be unchecked — clicking a selected row's star promotes it
 * instead. Unchecking the primary would leave the JD without one, and the API
 * re-adds it anyway (normaliseLocationIds), so the UI just doesn't offer it.
 */
export default function LocationPicker({
  locations,
  selectedIds,
  primaryId,
  disabled,
  onChange,
}: {
  locations: LocationOption[];
  selectedIds: string[];
  primaryId: string;
  disabled?: boolean;
  onChange: (next: { selectedIds: string[]; primaryId: string }) => void;
}) {
  const toggle = (id: string) => {
    if (id === primaryId) return; // primary stays in; promote another first
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange({ selectedIds: next, primaryId });
  };

  const promote = (id: string) => {
    // Promoting a city also selects it — you can't be primary without running there.
    const next = selectedIds.includes(id) ? selectedIds : [...selectedIds, id];
    onChange({ selectedIds: next, primaryId: id });
  };

  return (
    <div>
      <div className="border border-stone-200 rounded-lg bg-white divide-y divide-stone-100 max-h-56 overflow-auto">
        {locations.map((l) => {
          const checked = selectedIds.includes(l.id);
          const isPrimary = l.id === primaryId;
          return (
            <div key={l.id} className="flex items-center gap-2 px-2.5 py-1.5">
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || isPrimary}
                onChange={() => toggle(l.id)}
                className="w-3.5 h-3.5 accent-sky-500 disabled:opacity-50"
              />
              <span className={`flex-1 text-sm truncate ${checked ? "text-stone-800" : "text-stone-400"}`}>
                {l.city}
                {l.state && <span className="text-stone-400 text-xs"> · {l.state}</span>}
              </span>
              {isPrimary ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 inline-flex items-center gap-0.5 shrink-0">
                  <Star className="w-2.5 h-2.5 fill-sky-500 text-sky-500" /> primary
                </span>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => promote(l.id)}
                  className="text-[10px] text-stone-400 hover:text-sky-600 disabled:opacity-40 shrink-0"
                >
                  make primary
                </button>
              )}
            </div>
          );
        })}
        {locations.length === 0 && (
          <p className="px-2.5 py-3 text-xs text-stone-400 italic">No locations yet.</p>
        )}
      </div>
      <p className="mt-1 text-[10px] text-stone-400 leading-relaxed inline-flex items-start gap-1">
        <MapPin className="w-2.5 h-2.5 mt-0.5 shrink-0" />
        <span>
          One JD, several cities — same role and rubric, different local context. Each scouting day is
          generated for <em>one</em> of them, so the prompt carries that city&apos;s language, reference orgs and
          red flags. The primary names the JD and is the default pick.
        </span>
      </p>
    </div>
  );
}
