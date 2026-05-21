// Soft warning shown before a checklist item is marked complete manually.
// Returns true if the user confirmed (or no warning was needed), false to cancel.
//
// We auto-mark a checklist Done when its matching evidence lands:
//   Voice   → voice log recorded
//   Upload  → file uploaded
//   Activity → linked PitstopEvent marked Done
//
// A manual tick from a side / full panel means none of those happened, so we
// nudge the user before letting the bypass go through.
const MESSAGES: Record<string, string> = {
  Voice:    "This checklist needs a voice log. Mark complete anyway?",
  Upload:   "This checklist needs a file upload. Mark complete anyway?",
  Activity: "This checklist's activity isn't marked done. Mark complete anyway?",
};

export function confirmManualChecklistTick(
  completionType: string | null | undefined,
  nextChecked: boolean,
): boolean {
  if (!nextChecked) return true;            // un-checking is unrestricted
  if (!completionType) return true;          // legacy item without a type
  const msg = MESSAGES[completionType];
  if (!msg) return true;
  if (typeof window === "undefined") return true;
  return window.confirm(msg);
}
