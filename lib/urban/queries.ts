// Read side for /urban screens. Every list is scoped through
// visibleEffortsWhere (lib/urban/access) and every count comes from the
// uo_effort_status view (rule R3) — screens never count for themselves.
import prisma from "@/lib/prisma";
import { visibleEffortsWhere, can, type Actor } from "./access";
import { placePaths } from "./places";
import { parseSettings, type ProgrammeSettings } from "./settings";
import { addDays, fromDb, periodFor, toDb, todayIST, type Ymd } from "./time";

export type EffortPhase = "setting_up" | "running" | "ready_to_close" | "closed";

export type EffortStatus = {
  setupTotal: number;
  setupClosed: number;
  setupRequiredOpen: number;
  overdue: number;
  followupsOpen: number;
  followupsPartner: number;
  nextDue: Ymd | null;
  phase: EffortPhase;
};

type StatusRow = {
  effortId: string; setupTotal: bigint; setupClosed: bigint; setupRequiredOpen: bigint; overdue: bigint;
  followupsOpen: bigint; followupsPartner: bigint; nextDue: Date | null; phase: EffortPhase;
};

export async function effortStatuses(ids: string[]): Promise<Map<string, EffortStatus>> {
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw<StatusRow[]>`SELECT * FROM "uo_effort_status" WHERE "effortId" = ANY(${ids})`;
  return new Map(rows.map((r) => [r.effortId, {
    setupTotal: Number(r.setupTotal), setupClosed: Number(r.setupClosed), setupRequiredOpen: Number(r.setupRequiredOpen),
    overdue: Number(r.overdue), followupsOpen: Number(r.followupsOpen), followupsPartner: Number(r.followupsPartner),
    nextDue: r.nextDue ? fromDb(r.nextDue) : null, phase: r.phase,
  }]));
}

export type EffortRow = {
  id: string; title: string; programme: { key: string; name: string }; placePath: string;
  partner: string | null; owner: string; startMode: string; startedOn: Ymd; status: EffortStatus;
};

export async function listEfforts(actor: Actor): Promise<EffortRow[]> {
  const where = await visibleEffortsWhere(actor);
  const efforts = await prisma.uoEffort.findMany({
    where,
    orderBy: [{ closedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    select: {
      id: true, title: true, placeId: true, startMode: true, startedOn: true,
      programme: { select: { key: true, name: true } },
      partner: { select: { name: true } },
      owner: { select: { name: true, email: true } },
    },
  });
  const [statuses, paths] = await Promise.all([effortStatuses(efforts.map((e) => e.id)), placePaths([...new Set(efforts.map((e) => e.placeId))])]);
  return efforts.map((e) => ({
    id: e.id, title: e.title, programme: e.programme, placePath: paths.get(e.placeId) ?? "",
    partner: e.partner?.name ?? null, owner: e.owner.name ?? e.owner.email, startMode: e.startMode,
    startedOn: fromDb(e.startedOn), status: statuses.get(e.id)!,
  }));
}

export type EvidenceView = { id: string; kind: string; name: string; transcript: string | null };

export type TaskView = {
  id: string; key: string | null; phase: string | null; title: string; status: string; required: boolean;
  checkType: string; checkConfig: { list?: string; reading?: string; per?: string; hint?: string } | null;
  due: Ymd | null; dueSource: string; doneAt: string | null; doneBy: string | null; owner: string | null; who: string;
  result: Record<string, unknown> | null; evidence: EvidenceView[]; sourceTitle: string | null;
};

/** The parts of the programme settings a task screen needs (rating/observation lists, dimensions, reading labels). */
export type CheckContext = {
  lists: ProgrammeSettings["lists"];
  dimensions: ProgrammeSettings["dimensions"];
  readings: Record<string, { label: string; unit?: string }>;
};

export type RoutineStatus = {
  key: string; name: string; cadence: string; mode: string; items: number;
  period: { key: string; start: Ymd; end: Ymd };
  session: { id: string; closed: boolean; open: number; total: number } | null;
};

export type EffortDetail = {
  id: string; title: string; startMode: string; startedOn: Ymd; closedAt: string | null; closedReason: string | null;
  programme: { id: string; key: string; name: string; version: number; settings: ProgrammeSettings | null };
  placePath: string; partner: { name: string; mis: string | null } | null; owner: { id: string; name: string };
  status: EffortStatus; setup: TaskView[]; followups: TaskView[];
  routines: RoutineStatus[];
  pastSessions: { id: string; routine: string; period: string; closedAt: string | null; closedNote: string | null; early: boolean }[];
  readings: { key: string; label: string; unit?: string; dimension: string; dimensionLabel: string | null; value: number; asOf: Ymd; history: { value: number; asOf: Ymd }[] }[];
  check: CheckContext;
  events: { id: string; at: string; actor: string; action: string; entity: string; reason: string | null; after: unknown }[];
  canManage: boolean; canWork: boolean;
};

const TASK_INCLUDE = {
  evidence: { select: { id: true, kind: true, name: true, transcript: true }, orderBy: { createdAt: "asc" as const } },
} as const;

type TaskRow = Awaited<ReturnType<typeof prisma.uoTask.findMany<{ include: typeof TASK_INCLUDE }>>>[number];

async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  if (!uniq.length) return new Map();
  return new Map((await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name ?? u.email]));
}

function taskView(t: TaskRow, names: Map<string, string>, titles: Map<string, string>): TaskView {
  return {
    id: t.id, key: t.key, phase: t.phase, title: t.title, status: t.status, required: t.required,
    checkType: t.checkType, checkConfig: (t.checkConfig as TaskView["checkConfig"]) ?? null,
    due: t.due ? fromDb(t.due) : null, dueSource: t.dueSource, doneAt: t.doneAt?.toISOString() ?? null,
    doneBy: t.doneById ? names.get(t.doneById) ?? null : null, owner: t.ownerId ? names.get(t.ownerId) ?? null : null, who: t.who,
    result: (t.result as Record<string, unknown>) ?? null, evidence: t.evidence,
    sourceTitle: t.sourceTaskId ? titles.get(t.sourceTaskId) ?? null : null,
  };
}

function checkContext(s: ProgrammeSettings | null): CheckContext {
  return {
    lists: s?.lists ?? {},
    dimensions: s?.dimensions ?? {},
    readings: Object.fromEntries((s?.readings ?? []).map((r) => [r.key, { label: r.label, ...(r.unit ? { unit: r.unit } : {}) }])),
  };
}

export async function loadEffort(actor: Actor, id: string): Promise<EffortDetail | null> {
  if (!(await can(actor, "effort.view", id))) return null;
  const e = await prisma.uoEffort.findUnique({
    where: { id },
    include: {
      programme: true, partner: { select: { name: true, mis: true } }, owner: { select: { id: true, name: true, email: true } },
      tasks: { where: { kind: { in: ["setup", "followup"] } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: TASK_INCLUDE },
      sessions: { orderBy: { startedAt: "desc" }, include: { tasks: { select: { id: true, status: true } } } },
    },
  });
  if (!e) return null;
  const parsed = parseSettings(e.programme.settings);
  const settings = parsed.ok ? parsed.settings : null;
  const today = todayIST();

  const sourceIds = e.tasks.map((t) => t.sourceTaskId).filter(Boolean) as string[];
  const [statuses, paths, events, canManage, canWork, readingsRaw, sources] = await Promise.all([
    effortStatuses([e.id]),
    placePaths([e.placeId]),
    prisma.uoEvent.findMany({
      where: { OR: [{ entity: "effort", entityId: e.id }, { entity: "task", entityId: { in: [...e.tasks.map((t) => t.id), ...e.sessions.flatMap((x) => x.tasks.map((t) => t.id))] } }, { entity: "session", entityId: { in: e.sessions.map((s) => s.id) } }] },
      orderBy: { at: "desc" }, take: 60,
    }),
    can(actor, "effort.manage", e.id),
    can(actor, "effort.work", e.id),
    prisma.uoReading.findMany({ where: { effortId: e.id }, orderBy: [{ asOf: "desc" }, { updatedAt: "desc" }] }),
    sourceIds.length ? prisma.uoTask.findMany({ where: { id: { in: sourceIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
  ]);
  const names = await userNames([...e.tasks.flatMap((t) => [t.ownerId, t.doneById]), ...events.map((ev) => ev.actorId)]);
  const titles = new Map(sources.map((x) => [x.id, x.title]));

  // Routines: the current period's session for each.
  const routines: RoutineStatus[] = (settings?.routines ?? []).map((r) => {
    const period = periodFor(r.cadence, today);
    const s = e.sessions.find((x) => x.routineKey === r.key && x.period === period.key);
    return {
      key: r.key, name: r.name, cadence: r.cadence, mode: r.mode, items: r.items.length, period,
      session: s ? { id: s.id, closed: !!s.closedAt, open: s.tasks.filter((t) => t.status === "open").length, total: s.tasks.length } : null,
    };
  });
  const routineName = new Map((settings?.routines ?? []).map((r) => [r.key, r.name]));

  // Latest value per (reading, dimension).
  const seen = new Map<string, EffortDetail["readings"][number]>();
  const ctx = checkContext(settings);
  const dimLabel = (per: string | undefined, key: string) => (per ? settings?.dimensions[per]?.find((d) => d.key === key)?.label ?? key : null);
  const readings: EffortDetail["readings"] = [];
  for (const r of readingsRaw) {
    const k = `${r.key}|${r.dimension}`;
    const cur = seen.get(k);
    if (cur) { if (cur.history.length < 11) cur.history.push({ value: r.value, asOf: fromDb(r.asOf) }); continue; }
    const def = settings?.readings.find((x) => x.key === r.key);
    const row = { key: r.key, label: def?.label ?? r.key, unit: def?.unit, dimension: r.dimension, dimensionLabel: r.dimension ? dimLabel(def?.per, r.dimension) : null, value: r.value, asOf: fromDb(r.asOf), history: [] };
    seen.set(k, row);
    readings.push(row);
  }

  return {
    id: e.id, title: e.title, startMode: e.startMode, startedOn: fromDb(e.startedOn),
    closedAt: e.closedAt?.toISOString() ?? null, closedReason: e.closedReason,
    programme: { id: e.programme.id, key: e.programme.key, name: e.programme.name, version: e.programme.version, settings },
    placePath: paths.get(e.placeId) ?? "", partner: e.partner, owner: { id: e.owner.id, name: e.owner.name ?? e.owner.email },
    status: statuses.get(e.id)!,
    setup: e.tasks.filter((t) => t.kind === "setup").map((t) => taskView(t, names, titles)),
    followups: e.tasks.filter((t) => t.kind === "followup").map((t) => taskView(t, names, titles)),
    routines,
    pastSessions: e.sessions.filter((s) => s.closedAt).slice(0, 12).map((s) => ({
      id: s.id, routine: routineName.get(s.routineKey) ?? s.routineKey, period: s.period, closedAt: s.closedAt?.toISOString() ?? null, closedNote: s.closedNote,
      early: s.tasks.some((t) => t.status === "skipped"),
    })),
    readings,
    check: ctx,
    events: events.map((ev) => ({ id: ev.id, at: ev.at.toISOString(), actor: names.get(ev.actorId) ?? "someone", action: ev.action, entity: ev.entity, reason: ev.reason, after: ev.after })),
    canManage, canWork,
  };
}

export type SessionDetail = {
  id: string; routine: { key: string; name: string; cadence: string; mode: string }; period: string;
  startedAt: string; arrivedAt: string | null; closedAt: string | null; closedNote: string | null;
  effort: { id: string; title: string; placePath: string; partner: string | null; programme: string };
  tasks: TaskView[]; check: CheckContext; canWork: boolean;
};

export async function loadSession(actor: Actor, effortId: string, sessionId: string): Promise<SessionDetail | null> {
  if (!(await can(actor, "effort.view", effortId))) return null;
  const s = await prisma.uoSession.findFirst({
    where: { id: sessionId, effortId },
    include: {
      tasks: { orderBy: { sortOrder: "asc" }, include: TASK_INCLUDE },
      effort: { select: { id: true, title: true, placeId: true, partner: { select: { name: true } }, programme: { select: { name: true, settings: true } } } },
    },
  });
  if (!s) return null;
  const parsed = parseSettings(s.effort.programme.settings);
  const settings = parsed.ok ? parsed.settings : null;
  const r = settings?.routines.find((x) => x.key === s.routineKey);
  const [paths, names, canWork] = await Promise.all([
    placePaths([s.effort.placeId]),
    userNames(s.tasks.flatMap((t) => [t.ownerId, t.doneById])),
    can(actor, "effort.work", effortId),
  ]);
  return {
    id: s.id, routine: { key: s.routineKey, name: r?.name ?? s.routineKey, cadence: r?.cadence ?? "", mode: s.mode }, period: s.period,
    startedAt: s.startedAt.toISOString(), arrivedAt: s.arrivedAt?.toISOString() ?? null, closedAt: s.closedAt?.toISOString() ?? null, closedNote: s.closedNote,
    effort: { id: s.effort.id, title: s.effort.title, placePath: paths.get(s.effort.placeId) ?? "", partner: s.effort.partner?.name ?? null, programme: s.effort.programme.name },
    tasks: s.tasks.map((t) => taskView(t, names, new Map())), check: checkContext(settings), canWork,
  };
}

// ── Today (spec §7): one list of the actor's own work ───────────────────────

export type TodayItem = {
  id: string; title: string; kind: string; who: string; due: Ymd | null; checkType: string;
  effort: { id: string; title: string }; sessionId: string | null; phase: string | null;
};
export type TodayRoutine = { effortId: string; effortTitle: string; routineKey: string; name: string; mode: string; periodEnd: Ymd; sessionId: string | null; open: number | null };

export async function loadToday(actor: Actor): Promise<{ overdue: TodayItem[]; today: TodayItem[]; week: TodayItem[]; partner: TodayItem[]; routines: TodayRoutine[] }> {
  const today = todayIST();
  const weekEnd = addDays(today, 7);
  const tasks = await prisma.uoTask.findMany({
    where: {
      ownerId: actor.id, status: "open",
      effort: { closedAt: null },
      OR: [{ sessionId: null }, { session: { closedAt: null } }],
      due: { lte: toDb(weekEnd) },
    },
    orderBy: [{ due: "asc" }, { sortOrder: "asc" }],
    include: { effort: { select: { id: true, title: true } } },
  });
  const item = (t: (typeof tasks)[number]): TodayItem => ({
    id: t.id, title: t.title, kind: t.kind, who: t.who, due: t.due ? fromDb(t.due) : null, checkType: t.checkType,
    effort: t.effort, sessionId: t.sessionId, phase: t.phase,
  });
  // Session items are reached through their session, not listed one by one.
  const listable = tasks.filter((t) => t.kind !== "session");
  const mine = listable.filter((t) => t.who === "us");
  const partner = listable.filter((t) => t.who === "partner").map(item);
  const overdue = mine.filter((t) => t.due && fromDb(t.due) < today).map(item);
  const dueToday = mine.filter((t) => t.due && fromDb(t.due) === today).map(item);
  const week = mine.filter((t) => t.due && fromDb(t.due) > today).map(item);

  // Routines due this period on the actor's running efforts.
  const efforts = await prisma.uoEffort.findMany({
    where: { ownerId: actor.id, closedAt: null },
    select: { id: true, title: true, programme: { select: { settings: true } }, sessions: { select: { id: true, routineKey: true, period: true, closedAt: true, tasks: { select: { status: true } } } } },
  });
  const statuses = await effortStatuses(efforts.map((e) => e.id));
  const routines: TodayRoutine[] = [];
  for (const e of efforts) {
    if (statuses.get(e.id)?.phase !== "running") continue;
    const parsed = parseSettings(e.programme.settings);
    if (!parsed.ok) continue;
    for (const r of parsed.settings.routines) {
      const p = periodFor(r.cadence, today);
      const s = e.sessions.find((x) => x.routineKey === r.key && x.period === p.key);
      if (s?.closedAt) continue;
      routines.push({ effortId: e.id, effortTitle: e.title, routineKey: r.key, name: r.name, mode: r.mode, periodEnd: p.end, sessionId: s?.id ?? null, open: s ? s.tasks.filter((t) => t.status === "open").length : null });
    }
  }
  routines.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  return { overdue, today: dueToday, week, partner, routines };
}
