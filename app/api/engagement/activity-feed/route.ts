// Per-user, per-day activity feed for the Engagement tab.
// UNIONs AuditLog (primary, post-deployment) with direct-table reads (historical).
//
// Day boundary is IST (Asia/Kolkata, UTC+5:30). Pass ?date=YYYY-MM-DD interpreted in IST.

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

const IST_OFFSET_MIN = 330; // UTC+5:30

function istDayBounds(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  // IST 00:00 of given date == UTC of (date 00:00) minus 5:30
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MIN * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}

type FeedItem = {
  at: string;
  kind:
    | "goal_created" | "goal_updated" | "goal_deleted"
    | "pitstop_created" | "pitstop_updated" | "pitstop_deleted"
    | "activity_created" | "activity_completed" | "activity_cancelled"
    | "activity_rescheduled" | "activity_responded" | "activity_updated"
    | "checklist_created" | "checklist_checked" | "checklist_status_change" | "checklist_updated"
    | "standup" | "pitstop_date_change" | "system";
  summary: string;
  entityType: string;
  entityId: string;
  link?: string;
  detail?: { field?: string | null; oldValue?: string | null; newValue?: string | null };
};

const niceLabel = (s: string) => s.replace(/_/g, " ");

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const date = url.searchParams.get("date"); // YYYY-MM-DD (IST)
  if (!userId || !date) return Response.json({ error: "userId and date required" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

  // Authorization: self, or admin/super-admin (covers Leader access from Engagement tab).
  if (userId !== session.user.id && !isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { start, end } = istDayBounds(date);

  const [
    audits,
    eventsCreated,
    eventsCompleted,
    checklistsCompleted,
    dateChanges,
    standups,
    followups,
  ] = await Promise.all([
    prisma.auditLog.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pitstopEvent.findMany({
      where: { createdById: userId, createdAt: { gte: start, lt: end } },
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.pitstopEvent.findMany({
      where: { completedById: userId, completedAt: { gte: start, lt: end } },
      select: { id: true, title: true, completedAt: true },
    }),
    prisma.checklistItem.findMany({
      where: { completedById: userId, completedAt: { gte: start, lt: end } },
      select: {
        id: true, text: true, completedAt: true,
        pitstop: { select: { id: true, title: true, goalId: true } },
      },
    }),
    prisma.pitstopDateChange.findMany({
      where: { changedById: userId, createdAt: { gte: start, lt: end } },
      select: {
        id: true, pitstopId: true, field: true,
        oldDate: true, newDate: true, reason: true, createdAt: true,
        pitstop: { select: { title: true, goalId: true } },
      },
    }),
    prisma.standupLog.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      select: { id: true, createdAt: true },
    }),
    prisma.pitstopEventFollowup.findMany({
      where: { userId, response: { not: null }, updatedAt: { gte: start, lt: end } },
      select: {
        eventId: true, response: true, updatedAt: true,
        event: { select: { title: true } },
      },
    }),
  ]);

  // Bulk fetch entity titles referenced by AuditLog rows
  const goalIds = new Set<string>(), pitstopIds = new Set<string>(), eventIds = new Set<string>(), checklistIds = new Set<string>();
  for (const a of audits) {
    if (a.entityType === "Goal") goalIds.add(a.entityId);
    else if (a.entityType === "Pitstop") pitstopIds.add(a.entityId);
    else if (a.entityType === "Activity") eventIds.add(a.entityId);
    else if (a.entityType === "Checklist") checklistIds.add(a.entityId);
  }

  const [goalRows, pitstopRows, eventRows, checklistRows] = await Promise.all([
    goalIds.size
      ? prisma.goal.findMany({ where: { id: { in: [...goalIds] } }, select: { id: true, title: true } })
      : Promise.resolve([] as { id: string; title: string }[]),
    pitstopIds.size
      ? prisma.pitstop.findMany({ where: { id: { in: [...pitstopIds] } }, select: { id: true, title: true, goalId: true } })
      : Promise.resolve([] as { id: string; title: string; goalId: string }[]),
    eventIds.size
      ? prisma.pitstopEvent.findMany({ where: { id: { in: [...eventIds] } }, select: { id: true, title: true } })
      : Promise.resolve([] as { id: string; title: string }[]),
    checklistIds.size
      ? prisma.checklistItem.findMany({
          where: { id: { in: [...checklistIds] } },
          select: { id: true, text: true, pitstop: { select: { id: true, title: true, goalId: true } } },
        })
      : Promise.resolve([] as { id: string; text: string; pitstop: { id: string; title: string; goalId: string } }[]),
  ]);

  const goalTitle = new Map(goalRows.map(r => [r.id, r.title]));
  const pitstopRef = new Map(pitstopRows.map(r => [r.id, r]));
  const eventTitle = new Map(eventRows.map(r => [r.id, r.title]));
  const checklistRef = new Map(checklistRows.map(r => [r.id, r]));

  const items: FeedItem[] = [];

  for (const a of audits) {
    const at = a.createdAt.toISOString();
    const detail = { field: a.field, oldValue: a.oldValue, newValue: a.newValue };

    if (a.entityType === "Goal") {
      const title = goalTitle.get(a.entityId) ?? a.newValue ?? "(goal)";
      const link = `/goals/${a.entityId}`;
      if (a.action === "created") items.push({ at, kind: "goal_created", summary: `Created goal "${title}"`, entityType: "Goal", entityId: a.entityId, link });
      else if (a.action === "deleted") items.push({ at, kind: "goal_deleted", summary: `Deleted goal "${title}"`, entityType: "Goal", entityId: a.entityId });
      else items.push({ at, kind: "goal_updated", summary: `Updated goal "${title}" — ${a.field ?? niceLabel(a.action)}`, entityType: "Goal", entityId: a.entityId, link, detail });
      continue;
    }

    if (a.entityType === "Pitstop") {
      const p = pitstopRef.get(a.entityId);
      const title = p?.title ?? a.newValue ?? "(pitstop)";
      const link = p ? `/goals/${p.goalId}/pitstops/${a.entityId}` : undefined;
      if (a.action === "created") items.push({ at, kind: "pitstop_created", summary: `Created pitstop "${title}"`, entityType: "Pitstop", entityId: a.entityId, link });
      else if (a.action === "deleted") items.push({ at, kind: "pitstop_deleted", summary: `Deleted pitstop "${title}"`, entityType: "Pitstop", entityId: a.entityId });
      else if (a.action === "status_change" && a.newValue === "Done") items.push({ at, kind: "pitstop_updated", summary: `Marked pitstop "${title}" Done`, entityType: "Pitstop", entityId: a.entityId, link, detail });
      else if (a.action === "checkin") items.push({ at, kind: "pitstop_updated", summary: `Checked in on "${title}"`, entityType: "Pitstop", entityId: a.entityId, link, detail });
      else items.push({ at, kind: "pitstop_updated", summary: `Updated pitstop "${title}" — ${a.field ?? niceLabel(a.action)}`, entityType: "Pitstop", entityId: a.entityId, link, detail });
      continue;
    }

    if (a.entityType === "Activity") {
      const title = eventTitle.get(a.entityId) ?? a.newValue ?? "(activity)";
      const link = `/activities?event=${a.entityId}`;
      if (a.action === "created") items.push({ at, kind: "activity_created", summary: `Created activity "${title}"`, entityType: "Activity", entityId: a.entityId, link });
      else if (a.action === "deleted") items.push({ at, kind: "activity_updated", summary: `Deleted activity "${title}"`, entityType: "Activity", entityId: a.entityId });
      else if (a.action === "status_change") {
        const v = a.newValue;
        const kind = v === "Done" ? "activity_completed" : v === "Cancelled" ? "activity_cancelled" : "activity_updated";
        const verb = v === "Done" ? "Completed" : v === "Cancelled" ? "Cancelled" : `Status → ${v ?? ""}`;
        items.push({ at, kind, summary: `${verb} activity "${title}"`, entityType: "Activity", entityId: a.entityId, link, detail });
      } else if (a.action === "scheduledAt_change") {
        items.push({ at, kind: "activity_rescheduled", summary: `Rescheduled activity "${title}"`, entityType: "Activity", entityId: a.entityId, link, detail });
      } else if (a.action === "responded") {
        items.push({ at, kind: "activity_responded", summary: `Responded "${a.newValue}" to activity "${title}"`, entityType: "Activity", entityId: a.entityId, link, detail });
      } else {
        items.push({ at, kind: "activity_updated", summary: `Updated activity "${title}" — ${a.field ?? niceLabel(a.action)}`, entityType: "Activity", entityId: a.entityId, link, detail });
      }
      continue;
    }

    if (a.entityType === "Checklist") {
      const ci = checklistRef.get(a.entityId);
      const text = ci?.text ?? a.newValue ?? "(item)";
      const link = ci?.pitstop ? `/goals/${ci.pitstop.goalId}/pitstops/${ci.pitstop.id}` : undefined;
      if (a.action === "created") items.push({ at, kind: "checklist_created", summary: `Added checklist item "${text}"`, entityType: "Checklist", entityId: a.entityId, link });
      else if (a.action === "deleted") items.push({ at, kind: "checklist_updated", summary: `Deleted checklist item "${text}"`, entityType: "Checklist", entityId: a.entityId });
      else if (a.action === "status_change" || a.action === "checked_change") {
        const v = a.newValue;
        const isDone = v === "Done" || v === "true";
        items.push({
          at,
          kind: isDone ? "checklist_checked" : "checklist_status_change",
          summary: isDone ? `Checked off "${text}"` : `Set "${text}" → ${v ?? "(cleared)"}`,
          entityType: "Checklist", entityId: a.entityId, link, detail,
        });
      } else {
        items.push({ at, kind: "checklist_updated", summary: `Updated checklist "${text}" — ${a.field ?? niceLabel(a.action)}`, entityType: "Checklist", entityId: a.entityId, link, detail });
      }
      continue;
    }

    // Fallback for User/System/Decision/Risk audit rows
    items.push({
      at, kind: "system",
      summary: `${niceLabel(a.action)}${a.field ? ` (${a.field})` : ""}`,
      entityType: a.entityType, entityId: a.entityId, detail,
    });
  }

  // ── Direct-table fallback for events without AuditLog coverage ────────────
  for (const e of eventsCreated) {
    items.push({ at: e.createdAt.toISOString(), kind: "activity_created", summary: `Created activity "${e.title}"`, entityType: "Activity", entityId: e.id, link: `/activities?event=${e.id}` });
  }
  for (const e of eventsCompleted) {
    if (!e.completedAt) continue;
    items.push({ at: e.completedAt.toISOString(), kind: "activity_completed", summary: `Completed activity "${e.title}"`, entityType: "Activity", entityId: e.id, link: `/activities?event=${e.id}` });
  }
  for (const c of checklistsCompleted) {
    if (!c.completedAt) continue;
    const link = c.pitstop ? `/goals/${c.pitstop.goalId}/pitstops/${c.pitstop.id}` : undefined;
    items.push({ at: c.completedAt.toISOString(), kind: "checklist_checked", summary: `Checked off "${c.text}"`, entityType: "Checklist", entityId: c.id, link });
  }
  for (const dc of dateChanges) {
    const link = dc.pitstop ? `/goals/${dc.pitstop.goalId}/pitstops/${dc.pitstopId}` : undefined;
    const old = dc.oldDate.toISOString().slice(0, 10);
    const nu = dc.newDate.toISOString().slice(0, 10);
    items.push({
      at: dc.createdAt.toISOString(),
      kind: "pitstop_date_change",
      summary: `Moved ${dc.field} on "${dc.pitstop?.title ?? "pitstop"}" ${old} → ${nu}${dc.reason ? ` — ${dc.reason}` : ""}`,
      entityType: "Pitstop", entityId: dc.pitstopId, link,
    });
  }
  for (const s of standups) {
    items.push({ at: s.createdAt.toISOString(), kind: "standup", summary: `Submitted standup`, entityType: "Standup", entityId: s.id, link: `/standups` });
  }
  for (const f of followups) {
    items.push({
      at: f.updatedAt.toISOString(),
      kind: "activity_responded",
      summary: `Responded "${f.response}" to activity "${f.event?.title ?? ""}"`,
      entityType: "Activity", entityId: f.eventId,
      link: `/activities?event=${f.eventId}`,
    });
  }

  // Dedupe on (entityType, entityId, kind, minute) — collapses AuditLog + direct-table
  // duplicates that fire within the same minute.
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  items.sort((a, b) => b.at.localeCompare(a.at));
  for (const it of items) {
    const minute = it.at.slice(0, 16);
    const key = `${it.entityType}:${it.entityId}:${it.kind}:${minute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }

  return Response.json({ items: out, count: out.length, date, userId });
}
