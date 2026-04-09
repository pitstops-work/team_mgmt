export type TimelineInfo =
  | { status: "no-dates" }
  | { status: "on-track"; daysLeft: number }
  | { status: "due-today" }
  | { status: "overdue"; daysLate: number }
  | { status: "done-on-time" }
  | { status: "done-late"; daysLate: number }
  | { status: "done-no-target" };

export function getTimelineInfo(pitstop: {
  status: string;
  targetDate?: string | null;
  completedAt?: string | null;
}): TimelineInfo {
  const { targetDate, completedAt, status } = pitstop;

  if (!targetDate) return status === "Done" ? { status: "done-no-target" } : { status: "no-dates" };

  const target = new Date(targetDate);
  target.setHours(23, 59, 59, 999);

  if (status === "Done") {
    const completed = completedAt ? new Date(completedAt) : new Date();
    const daysLate = Math.floor((completed.getTime() - target.getTime()) / 86400000);
    return daysLate <= 0 ? { status: "done-on-time" } : { status: "done-late", daysLate };
  }

  const daysLeft = Math.ceil((target.getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return { status: "overdue", daysLate: Math.abs(daysLeft) };
  if (daysLeft === 0) return { status: "due-today" };
  return { status: "on-track", daysLeft };
}

export function timelineChip(info: TimelineInfo): { label: string; cls: string } | null {
  switch (info.status) {
    case "no-dates":
    case "done-no-target":
      return null;
    case "on-track":
      return {
        label: `${info.daysLeft}d left`,
        cls: info.daysLeft <= 3
          ? "bg-amber-50 text-amber-600 border-amber-200"
          : "bg-emerald-50 text-emerald-600 border-emerald-200",
      };
    case "due-today":
      return { label: "Due today", cls: "bg-amber-50 text-amber-600 border-amber-200" };
    case "overdue":
      return { label: `${info.daysLate}d late`, cls: "bg-red-50 text-red-500 border-red-200" };
    case "done-on-time":
      return { label: "On time ✓", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" };
    case "done-late":
      return { label: `${info.daysLate}d late`, cls: "bg-stone-100 text-stone-400 border-stone-200" };
  }
}

// Border colour for route map nodes
export function timelineNodeBorder(info: TimelineInfo): string {
  switch (info.status) {
    case "overdue": return "border-red-300";
    case "due-today": return "border-amber-300";
    case "on-track": return info.daysLeft <= 3 ? "border-amber-200" : "border-emerald-200";
    case "done-on-time": return "border-emerald-300";
    default: return "";
  }
}

// Health score for a pitstop — red / amber / green / none
export type PitstopHealth = "red" | "amber" | "green" | "none";

export function getPitstopHealth(pitstop: {
  status: string;
  targetDate?: string | null;
  updatedAt?: string | null;
}): PitstopHealth {
  const { status, targetDate, updatedAt } = pitstop;
  if (status === "Done") return "green";

  const info = getTimelineInfo(pitstop);
  const stale = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) > 14 * 24 * 60 * 60 * 1000 : false;

  if (info.status === "overdue") return "red";
  if (stale) return "red";
  if (info.status === "due-today") return "amber";
  if (info.status === "on-track" && info.daysLeft <= 7) return "amber";
  if (!targetDate) return "none";
  return "green";
}

export const HEALTH_DOT: Record<PitstopHealth, string> = {
  red:   "bg-red-500",
  amber: "bg-amber-400",
  green: "bg-emerald-400",
  none:  "bg-transparent",
};

// Format a date string as "12 Mar 2025"
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Convert ISO/DB date to YYYY-MM-DD for <input type="date">
export function toDateInput(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().split("T")[0];
}
