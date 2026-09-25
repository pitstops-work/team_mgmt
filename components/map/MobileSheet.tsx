"use client";

import { useEffect, useState } from "react";

// Map detail panels are bottom sheets on phones. A sheet can be minimised to
// a strip showing its handle and title, so the map behind it stays usable
// without losing the selection.

/** Minimised state that resets to `startMinimised` whenever `key` (the selection) changes. */
export function useSheetMinimised(key: string | null, startMinimised = false) {
  const [minimised, setMinimised] = useState(startMinimised);
  useEffect(() => {
    if (key) setMinimised(startMinimised);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [minimised, setMinimised] as const;
}

/** Mobile transform for a bottom sheet: hidden, minimised to a strip, or fully open. */
export function sheetMobileClass(isOpen: boolean, minimised: boolean): string {
  if (!isOpen) return "translate-y-full";
  return minimised ? "translate-y-[calc(100%-7rem)]" : "translate-y-0";
}

/** Replaces the static drag handle: tap to minimise or expand the sheet. */
export function SheetHandle({ minimised, onToggle }: { minimised: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="sm:hidden flex-shrink-0 w-full flex flex-col items-center gap-0.5 pt-2 pb-1 active:bg-slate-50"
      aria-label={minimised ? "Show details" : "Minimise to see the map"}
    >
      <span className="w-10 h-1 rounded-full bg-slate-300" />
      <span className="text-[10px] font-semibold text-slate-400">
        {minimised ? "▲ Show details" : "▼ Show map"}
      </span>
    </button>
  );
}
