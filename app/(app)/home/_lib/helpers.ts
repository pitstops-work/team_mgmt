import type { Activity, ZLTeamActivity } from "./types";
import type { AdminEngagementStat } from "../page";


export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
export function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
export function isToday(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}
export function daysDiff(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
export function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function activityMeta(a: Activity, uid: string) {
  const ps = a.pitstops?.[0]?.pitstop;
  const goal = ps?.goal;
  const isOwner = ps?.ownerId === uid;
  const isAttendee = !isOwner && (a.attendees?.some(at => at.user.id === uid) ?? false);
  const geo = goal?.needsSettlement?.name ?? goal?.needsCluster?.name ?? goal?.needsZone?.name ?? null;
  const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
  return { ps, goal, isOwner, isAttendee, geo, domain };
}

export function groupByDay<T>(items: T[], getDate: (item: T) => string): { label: string; items: T[] }[] {
  const map = new Map<string, { label: string; items: T[] }>();
  for (const item of items) {
    const d = new Date(getDate(item));
    const key = d.toDateString();
    if (!map.has(key)) map.set(key, { label: fmtDate(getDate(item)), items: [] });
    map.get(key)!.items.push(item);
  }
  return Array.from(map.values());
}

export function engLevel(s: AdminEngagementStat): "good" | "at-risk" | "poor" | "inactive" {
  const daysAgo = s.lastLoginAt
    ? Math.floor((Date.now() - new Date(s.lastLoginAt).getTime()) / 86400000)
    : Infinity;
  if (daysAgo > 30 && s.logins30d === 0) return "inactive";
  if (daysAgo > 14 || s.completionRate < 30 || s.stalePitstopCount > 3) return "poor";
  if (daysAgo > 7  || s.completionRate < 60 || s.stalePitstopCount > 0) return "at-risk";
  return "good";
}

export function istTodayStr(): string {
  // Render the date in IST (UTC+5:30) — covers Bangalore & Chennai.
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  return ist.toISOString().slice(0, 10);
}

export function shiftIstDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Build the date in UTC at noon to dodge DST/timezone edges (irrelevant for IST, defensive).
  const t = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}


export function groupBySla(activities: ZLTeamActivity[]) {
  const map: Record<string, ZLTeamActivity[]> = {};
  for (const a of activities) {
    const key = a.pitstops[0]?.pitstop.targetDate?.slice(0, 10) ?? "no-date";
    (map[key] ??= []).push(a);
  }
  return Object.entries(map).sort(([a], [b]) => {
    if (a === "no-date") return 1;
    if (b === "no-date") return -1;
    return new Date(a).getTime() - new Date(b).getTime();
  });
}

export function slaHeaderLabel(dateKey: string, todayMs: number): { label: string; isOverdue: boolean } {
  if (dateKey === "no-date") return { label: "No due date", isOverdue: false };
  const dMs = new Date(dateKey).getTime();
  if (dMs === todayMs) return { label: "Due today", isOverdue: false };
  if (dMs < todayMs) return { label: `Overdue · ${fmtDate(dateKey)}`, isOverdue: true };
  return { label: `Due ${fmtDate(dateKey)}`, isOverdue: false };
}

// ── PM components ────────────────────────────────────────────────────────────

type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };
type PMDrillDown =
  | { type: "zl-overdue"; zlId: string }
  | { type: "zl-checklists"; zlId: string }
  | { type: "rp-overdue"; rpId: string }
  | { type: "rp-checklists"; rpId: string }
  | null;


export function fmtDomain(d: string) {
  return d.replace(/([A-Z])/g, " $1").trim();
}

// ── RP overdue card — rich card for mobile carousel ───────────────────────────

