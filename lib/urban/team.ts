// The Team screen (spec §7): exceptions only, for the people under me.
//
//   Stuck in setup     setting up, and either the next required item is overdue
//                      or no setup item was closed in 14 days (spec §8)
//   Missed routines    a routine period that ended with no closed session (§8),
//                      looking back over the last three periods since setup finished
//   Overdue follow-ups split us vs partner
//   Repeat reschedules an open item moved two or more times
//   Non-negotiables    the latest safety rating has a non-negotiable marked "Not OK"
//
// Scope: open efforts owned by the actor or anyone below them (admins and
// leaders: everyone). Phases come from uo_effort_status (rule R3).
import prisma from "@/lib/prisma";
import { type Actor, teamOf } from "./access";
import { effortStatuses } from "./queries";
import { parseSettings, type ProgrammeSettings } from "./settings";
import { addDays, daysBetween, fromDb, istDate, periodFor, toDb, todayIST, type Ymd } from "./time";

export const STUCK_DAYS = 14;
const LOOKBACK_PERIODS = 3;

type EffortRef = { id: string; title: string; owner: string; ownerId: string; programme: string };

export type TeamView = {
  people: { id: string; name: string; efforts: number; exceptions: number }[];
  stuck: (EffortRef & { item: string | null; itemDue: Ymd | null; why: "overdue" | "idle"; idleDays: number })[];
  missed: (EffortRef & { routine: string; periods: string[]; of: number })[];
  followups: { us: FollowupRow[]; partner: FollowupRow[] };
  reschedules: (EffortRef & { taskId: string; task: string; times: number; due: Ymd | null })[];
  failing: (EffortRef & { rating: string; on: Ymd; points: { text: string; followupOpen: boolean }[] })[];
  effortCount: number;
};

type FollowupRow = EffortRef & { taskId: string; title: string; due: Ymd; daysOver: number };

export async function loadTeam(actor: Actor, onlyOwnerId: string | null): Promise<TeamView> {
  const team = await teamOf(actor);
  const today = todayIST();
  const ownerWhere = team === "any" ? {} : { ownerId: { in: team } };

  const efforts = await prisma.uoEffort.findMany({
    where: { closedAt: null, ...ownerWhere },
    select: {
      id: true, title: true, ownerId: true, startedOn: true, createdAt: true,
      owner: { select: { name: true, email: true } },
      programme: { select: { name: true, settings: true } },
    },
  });
  const statuses = await effortStatuses(efforts.map((e) => e.id));
  const settingsOf = new Map<string, ProgrammeSettings | null>();
  for (const e of efforts) {
    const p = parseSettings(e.programme.settings);
    settingsOf.set(e.id, p.ok ? p.settings : null);
  }
  const ref = (e: (typeof efforts)[number]): EffortRef => ({ id: e.id, title: e.title, owner: e.owner.name ?? e.owner.email, ownerId: e.ownerId, programme: e.programme.name });
  const scoped = onlyOwnerId ? efforts.filter((e) => e.ownerId === onlyOwnerId) : efforts;
  const ids = scoped.map((e) => e.id);
  const byId = new Map(efforts.map((e) => [e.id, e]));

  const [setupTasks, sessions, followups, ratings] = await Promise.all([
    prisma.uoTask.findMany({ where: { effortId: { in: ids }, kind: "setup" }, select: { effortId: true, title: true, status: true, required: true, due: true, doneAt: true, sortOrder: true } }),
    prisma.uoSession.findMany({ where: { effortId: { in: ids }, closedAt: { not: null } }, select: { effortId: true, routineKey: true, period: true } }),
    prisma.uoTask.findMany({ where: { effortId: { in: ids }, kind: "followup", status: "open", due: { lt: toDb(today) } }, select: { id: true, effortId: true, title: true, who: true, due: true }, orderBy: { due: "asc" } }),
    prisma.uoTask.findMany({ where: { effortId: { in: ids }, checkType: "rating", status: "done" }, select: { id: true, effortId: true, title: true, checkConfig: true, result: true, doneAt: true }, orderBy: { doneAt: "desc" } }),
  ]);

  // ── Stuck in setup
  const stuck: TeamView["stuck"] = [];
  for (const e of scoped) {
    if (statuses.get(e.id)?.phase !== "setting_up") continue;
    const tasks = setupTasks.filter((t) => t.effortId === e.id);
    const next = tasks.filter((t) => t.status === "open" && t.required).sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity) || a.sortOrder - b.sortOrder)[0];
    const lastDone = tasks.reduce<Date | null>((m, t) => (t.doneAt && (!m || t.doneAt > m) ? t.doneAt : m), null);
    const start = fromDb(e.startedOn);
    const since: Ymd = lastDone && istDate(lastDone) > start ? istDate(lastDone) : start;
    const idleDays = daysBetween(since, today);
    const nextDue = next?.due ? fromDb(next.due) : null;
    const overdue = !!nextDue && nextDue < today;
    if (overdue || idleDays >= STUCK_DAYS) stuck.push({ ...ref(e), item: next?.title ?? null, itemDue: nextDue, why: overdue ? "overdue" : "idle", idleDays });
  }
  stuck.sort((a, b) => b.idleDays - a.idleDays);

  // ── Missed routines: periods that ended with no closed session, since setup finished.
  const missed: TeamView["missed"] = [];
  for (const e of scoped) {
    if (statuses.get(e.id)?.phase !== "running") continue;
    const s = settingsOf.get(e.id);
    if (!s) continue;
    const tasks = setupTasks.filter((t) => t.effortId === e.id && t.required);
    // Running since: the last required setup item closed, or the start date if there were none.
    const runningSince: Ymd = tasks.reduce<Ymd>((m, t) => {
      if (!t.doneAt) return m;
      const d = istOf(t.doneAt);
      return d > m ? d : m;
    }, fromDb(e.startedOn));
    for (const r of s.routines) {
      const closed = new Set(sessions.filter((x) => x.effortId === e.id && x.routineKey === r.key).map((x) => x.period));
      const periods: string[] = [];
      let of = 0;
      let p = periodFor(r.cadence, addDays(periodFor(r.cadence, today).start, -1));
      for (let i = 0; i < LOOKBACK_PERIODS; i++) {
        if (p.end < runningSince) break;
        of++;
        if (!closed.has(p.key)) periods.push(p.key);
        p = periodFor(r.cadence, addDays(p.start, -1));
      }
      if (periods.length) missed.push({ ...ref(e), routine: r.name, periods, of });
    }
  }
  missed.sort((a, b) => b.periods.length - a.periods.length);

  // ── Overdue follow-ups
  const fu = (t: (typeof followups)[number]): FollowupRow => {
    const due = fromDb(t.due!);
    return { ...ref(byId.get(t.effortId)!), taskId: t.id, title: t.title, due, daysOver: daysBetween(due, today) };
  };

  // ── Repeat reschedules: open tasks (any kind) in scope moved ≥ 2 times.
  const openTasks = await prisma.uoTask.findMany({ where: { effortId: { in: ids }, status: "open" }, select: { id: true, effortId: true, title: true, due: true } });
  const counts = openTasks.length
    ? await prisma.uoEvent.groupBy({ by: ["entityId"], where: { entity: "task", action: "rescheduled", entityId: { in: openTasks.map((t) => t.id) } }, _count: { _all: true } })
    : [];
  const taskById = new Map(openTasks.map((t) => [t.id, t]));
  const reschedules: TeamView["reschedules"] = counts
    .filter((c) => c._count._all >= 2)
    .map((c) => {
      const t = taskById.get(c.entityId)!;
      return { ...ref(byId.get(t.effortId)!), taskId: t.id, task: t.title, times: c._count._all, due: t.due ? fromDb(t.due) : null };
    })
    .sort((a, b) => b.times - a.times);

  // ── Non-negotiables failing in the latest rating of each list, per effort.
  const failing: TeamView["failing"] = [];
  const seen = new Set<string>();
  const raisedIds: string[] = [];
  const pending: { e: EffortRef; rating: string; on: Ymd; fails: { text: string; raisedId: string | null }[] }[] = [];
  for (const t of ratings) {
    const list = (t.checkConfig as { list?: string } | null)?.list ?? "";
    const k = `${t.effortId}|${list}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const s = settingsOf.get(t.effortId);
    const points = (list && s?.lists[list]) || [];
    const res = (t.result ?? {}) as { marks?: Record<string, string>; raised?: Record<string, string> };
    const fails = points.filter((p) => p.non_negotiable && res.marks?.[p.key] === "fail").map((p) => ({ text: p.text, raisedId: res.raised?.[p.key] ?? null }));
    if (!fails.length) continue;
    raisedIds.push(...(fails.map((f) => f.raisedId).filter(Boolean) as string[]));
    pending.push({ e: ref(byId.get(t.effortId)!), rating: t.title, on: istOf(t.doneAt!), fails });
  }
  const openRaised = new Set(raisedIds.length ? (await prisma.uoTask.findMany({ where: { id: { in: raisedIds }, status: "open" }, select: { id: true } })).map((x) => x.id) : []);
  for (const p of pending) failing.push({ ...p.e, rating: p.rating, on: p.on, points: p.fails.map((f) => ({ text: f.text, followupOpen: !!f.raisedId && openRaised.has(f.raisedId) })) });

  const view: TeamView = {
    people: [],
    stuck, missed,
    followups: { us: followups.filter((t) => t.who !== "partner").map(fu), partner: followups.filter((t) => t.who === "partner").map(fu) },
    reschedules, failing,
    effortCount: scoped.length,
  };

  // People chips: everyone in scope who owns an open effort, with their exception count (unfiltered).
  if (!onlyOwnerId) {
    const exc = new Map<string, number>();
    const bump = (id: string) => exc.set(id, (exc.get(id) ?? 0) + 1);
    stuck.forEach((x) => bump(x.ownerId)); missed.forEach((x) => bump(x.ownerId)); reschedules.forEach((x) => bump(x.ownerId)); failing.forEach((x) => bump(x.ownerId));
    [...view.followups.us, ...view.followups.partner].forEach((x) => bump(x.ownerId));
    view.people = peopleOf(efforts.map(ref), exc);
  } else {
    view.people = peopleOf(efforts.map(ref), new Map());
  }
  return view;
}

function peopleOf(efforts: EffortRef[], exc: Map<string, number>) {
  const m = new Map<string, { id: string; name: string; efforts: number; exceptions: number }>();
  for (const e of efforts) {
    const p = m.get(e.ownerId) ?? { id: e.ownerId, name: e.owner, efforts: 0, exceptions: exc.get(e.ownerId) ?? 0 };
    p.efforts++;
    m.set(e.ownerId, p);
  }
  return [...m.values()].sort((a, b) => b.exceptions - a.exceptions || a.name.localeCompare(b.name));
}

const istOf = (d: Date): Ymd => istDate(d);
