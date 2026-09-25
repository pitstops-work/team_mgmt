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

// ── Desktop ────────────────────────────────────────────────────────────────
// On desktop the sheet is a right-hand column. Minimising slides it off the
// map and leaves a tab at the right edge that brings it back.

/** Desktop transform for the right-hand panel. */
export function sheetDesktopClass(isOpen: boolean, minimised: boolean): string {
  return isOpen && !minimised ? "sm:translate-x-0" : "sm:translate-x-full";
}

/** Header button (desktop only) that slides the panel off the map. */
export function MinimiseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Hide panel to see the map"
      aria-label="Hide panel to see the map"
      className="hidden sm:flex w-7 h-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors text-base leading-none"
    >
      »
    </button>
  );
}

/** Tab at the map's right edge (desktop only) while the panel is minimised. */
export function DesktopSheetTab({ show, label, onExpand }: { show: boolean; label: string; onExpand: () => void }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onExpand}
      title="Show details"
      className="hidden sm:flex absolute right-3 top-14 z-30 max-w-[16rem] items-center gap-1.5 px-3 h-8 rounded-lg border border-slate-200 shadow bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
    >
      <span aria-hidden>◀</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
