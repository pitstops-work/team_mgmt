// Read side for /urban screens. Every list is scoped through
// visibleEffortsWhere (lib/urban/access) and every count comes from the
// uo_effort_status view (rule R3) — screens never count for themselves.
import prisma from "@/lib/prisma";
import { visibleEffortsWhere, can, type Actor } from "./access";
import { placePaths } from "./places";
import { parseSettings, type ProgrammeSettings } from "./settings";
import { fromDb, type Ymd } from "./time";

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

export type TaskView = {
  id: string; key: string | null; phase: string | null; title: string; status: string; required: boolean;
  checkType: string; due: Ymd | null; dueSource: string; doneAt: string | null; owner: string | null; who: string;
};

export type EffortDetail = {
  id: string; title: string; startMode: string; startedOn: Ymd; closedAt: string | null; closedReason: string | null;
  programme: { id: string; key: string; name: string; version: number; settings: ProgrammeSettings | null };
  placePath: string; partner: { name: string; mis: string | null } | null; owner: { id: string; name: string };
  status: EffortStatus; setup: TaskView[]; followups: TaskView[];
  events: { id: string; at: string; actor: string; action: string; entity: string; reason: string | null }[];
  canManage: boolean; canWork: boolean;
};

export async function loadEffort(actor: Actor, id: string): Promise<EffortDetail | null> {
  if (!(await can(actor, "effort.view", id))) return null;
  const e = await prisma.uoEffort.findUnique({
    where: { id },
    include: {
      programme: true, partner: { select: { name: true, mis: true } }, owner: { select: { id: true, name: true, email: true } },
      tasks: { where: { kind: { in: ["setup", "followup"] } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { owner: { select: { name: true, email: true } } } },
    },
  });
  if (!e) return null;
  const taskIds = e.tasks.map((t) => t.id);
  const [statuses, paths, events, canManage, canWork] = await Promise.all([
    effortStatuses([e.id]),
    placePaths([e.placeId]),
    prisma.uoEvent.findMany({
      where: { OR: [{ entity: "effort", entityId: e.id }, { entity: "task", entityId: { in: taskIds } }] },
      orderBy: { at: "desc" }, take: 50,
    }),
    can(actor, "effort.manage", e.id),
    can(actor, "effort.work", e.id),
  ]);
  const actorIds = [...new Set(events.map((ev) => ev.actorId))];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u.name ?? u.email]));
  const parsed = parseSettings(e.programme.settings);
  const view = (t: (typeof e.tasks)[number]): TaskView => ({
    id: t.id, key: t.key, phase: t.phase, title: t.title, status: t.status, required: t.required, checkType: t.checkType,
    due: t.due ? fromDb(t.due) : null, dueSource: t.dueSource, doneAt: t.doneAt?.toISOString() ?? null,
    owner: t.owner ? t.owner.name ?? t.owner.email : null, who: t.who,
  });
  return {
    id: e.id, title: e.title, startMode: e.startMode, startedOn: fromDb(e.startedOn),
    closedAt: e.closedAt?.toISOString() ?? null, closedReason: e.closedReason,
    programme: { id: e.programme.id, key: e.programme.key, name: e.programme.name, version: e.programme.version, settings: parsed.ok ? parsed.settings : null },
    placePath: paths.get(e.placeId) ?? "", partner: e.partner, owner: { id: e.owner.id, name: e.owner.name ?? e.owner.email },
    status: statuses.get(e.id)!,
    setup: e.tasks.filter((t) => t.kind === "setup").map(view),
    followups: e.tasks.filter((t) => t.kind === "followup").map(view),
    events: events.map((ev) => ({ id: ev.id, at: ev.at.toISOString(), actor: actors.get(ev.actorId) ?? "someone", action: ev.action, entity: ev.entity, reason: ev.reason })),
    canManage, canWork,
  };
}
