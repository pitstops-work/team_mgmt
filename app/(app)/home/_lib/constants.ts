

export const STATUS_BADGE: Record<string, string> = {
  Active:   "bg-sky-50 text-sky-700 border-sky-200",
  Paused:   "bg-amber-50 text-amber-700 border-amber-200",
  Complete: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
export const STATUS_DOT: Record<string, string> = {
  Active: "bg-sky-400", Paused: "bg-amber-400", Complete: "bg-emerald-400",
};
export const CHECKLIST_STATUS_DOT: Record<string, string> = {
  NotStarted: "bg-stone-200", Scheduled: "bg-sky-300", InProgress: "bg-amber-400",
  Done: "bg-emerald-400", Blocked: "bg-red-400", Rescheduled: "bg-violet-400",
};
export const EVENT_TYPE_COLOR: Record<string, string> = {
  Meeting: "bg-sky-400", Visit: "bg-violet-400", Event: "bg-amber-400", Training: "bg-emerald-400",
};
export const DESIGNATION_ORDER = ["Leader", "PM", "ZL", "RP", "Other"];
export const DESIGNATION_COLOR: Record<string, string> = {
  Leader: "bg-amber-100 text-amber-700",
  PM: "bg-violet-100 text-violet-700",
  ZL: "bg-sky-100 text-sky-700",
  RP: "bg-emerald-100 text-emerald-700",
  Other: "bg-stone-100 text-stone-600",
};
export const PITSTOP_STATUS_COLOR: Record<string, string> = {
  Upcoming: "#60a5fa",
  InProgress: "#fbbf24",
  Done: "#34d399",
  Cancelled: "#d1d5db",
  Blocked: "#f87171",
};

export const ACTIVITY_TYPE_STYLE: Record<string, string> = {
  Visit:    "bg-violet-100 text-violet-700",
  Meeting:  "bg-sky-100 text-sky-700",
  Training: "bg-emerald-100 text-emerald-700",
  Event:    "bg-amber-100 text-amber-700",
};
