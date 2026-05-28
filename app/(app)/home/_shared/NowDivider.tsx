"use client";

/**
 * Thin "Now" rule rendered between past-due-today and later-today items.
 * Visually orients the RP to the current moment within their day.
 */
export function NowDivider() {
  return (
    <div className="flex items-center gap-2 my-1" aria-label="Current time">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-sky-300 to-transparent" />
      <span className="text-[10px] font-bold text-sky-600 uppercase tracking-widest">Now</span>
      <div className="flex-1 h-px bg-gradient-to-r from-sky-300 via-sky-300 to-transparent" />
    </div>
  );
}
