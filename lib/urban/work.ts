// Doing the work (spec §4.3, §4.4, Phase 2): complete / undo / skip /
// reschedule a task, raise follow-ups, run a session.
//
// Every function takes an Actor that the caller has ALREADY authorised for
// "effort.work" on the task's effort (lib/urban/access). Each runs in one
// transaction and logs Events (rule R4). When the actor isn't the effort's
// owner the event says so ("stepped in"), so supervision is visible.
import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import type { Actor } from "./access";
import { logEvent, logEvents, type EventInput } from "./events";
import { UrbanInputError } from "./efforts";
import { parseSettings, checkConfigFor, type ProgrammeSettings, type ListPoint } from "./settings";
import { addDays, periodFor, toDb, todayIST, type Ymd } from "./time";

type Tx = Prisma.TransactionClient;

const FOLLOWUP_DAYS = 7;

// ── Inputs per check type ──────────────────────────────────────────────────

/** What the client sends when completing a task. Validated against the task's checkType. */
export type CompleteInput = {
  note?: string;
  /** number: one value, or one per dimension value (e.g. per scheme). */
  value?: number | null;
  values?: Record<string, number | null>;
  /** rating: point key → ok | fail | na. */
  marks?: Record<string, "ok" | "fail" | "na">;
  /** observation: practice key → gap (needs improving) | escalate (raise a follow-up). Unmarked = seen and fine. */
  flags?: Record<string, "gap" | "escalate">;
};

async function loadTaskCtx(tx: Tx, taskId: string) {
  const task = await tx.uoTask.findUnique({
    where: { id: taskId },
    include: {
      effort: { select: { id: true, ownerId: true, closedAt: true, programme: { select: { settings: true, name: true } } } },
      session: { select: { id: true, closedAt: true, mode: true, arrivedAt: true } },
      _count: { select: { evidence: true } },
    },
  });
  if (!task) throw new UrbanInputError("That task no longer exists");
  if (task.effort.closedAt) throw new UrbanInputError("This effort is closed");
  if (task.session?.closedAt) throw new UrbanInputError("That session is closed");
  const parsed = parseSettings(task.effort.programme.settings);
  if (!parsed.ok) throw new UrbanInputError("The programme's settings are invalid — ask an admin");
  return { task, settings: parsed.settings };
}

function stepIn(actor: Actor, ownerId: string) {
  return actor.id === ownerId ? {} : { steppedIn: true };
}

function listFor(s: ProgrammeSettings, cfg: unknown): ListPoint[] {
  const name = (cfg as { list?: string } | null)?.list;
  return (name && s.lists[name]) || [];
}

// ── Complete ───────────────────────────────────────────────────────────────

export async function completeTask(actor: Actor, taskId: string, input: CompleteInput): Promise<{ followupsRaised: number }> {
  return prisma.$transaction(async (tx) => {
    const { task, settings } = await loadTaskCtx(tx, taskId);
    if (task.status !== "open") throw new UrbanInputError("This is already closed — undo it first to change it");
    if (task.session?.mode === "visit" && !task.session.arrivedAt) throw new UrbanInputError("Mark \"I've reached\" first");
    const today = todayIST();
    const note = input.note?.trim() || undefined;
    let result: Record<string, unknown> = note ? { note } : {};
    const raise: { title: string; who: "us" | "partner"; reasonKey: string }[] = [];
    const prevRaised = ((task.result as { raised?: Record<string, string> } | null)?.raised) ?? {};

    switch (task.checkType) {
      case "tick":
        break;
      case "note":
        if (!note) throw new UrbanInputError("Write what was found or agreed");
        break;
      case "voice":
      case "photo":
        if (task._count.evidence === 0) throw new UrbanInputError(task.checkType === "voice" ? "Record a voice note first" : "Add a photo or file first");
        break;
      case "number": {
        const cfg = (task.checkConfig ?? {}) as { reading?: string; per?: string };
        if (!cfg.reading) throw new UrbanInputError("This item has no reading configured — ask an admin");
        const dims = cfg.per ? settings.dimensions[cfg.per] ?? [] : [];
        const rows: { dimension: string; value: number }[] = [];
        if (dims.length) {
          for (const d of dims) {
            const v = input.values?.[d.key];
            if (v === null || v === undefined || Number.isNaN(v)) continue;
            if (!Number.isFinite(v) || v < 0) throw new UrbanInputError(`${d.label}: enter a number of 0 or more`);
            rows.push({ dimension: d.key, value: v });
          }
          if (!rows.length) throw new UrbanInputError("Enter at least one figure");
        } else {
          const v = input.value;
          if (v === null || v === undefined || !Number.isFinite(v) || v < 0) throw new UrbanInputError("Enter a number of 0 or more");
          rows.push({ dimension: "", value: v });
        }
        for (const r of rows) {
          await tx.uoReading.upsert({
            where: { effortId_key_dimension_asOf: { effortId: task.effortId, key: cfg.reading, dimension: r.dimension, asOf: toDb(today) } },
            create: { effortId: task.effortId, key: cfg.reading, dimension: r.dimension, value: r.value, asOf: toDb(today), sessionId: task.sessionId, source: "manual", enteredById: actor.id },
            update: { value: r.value, sessionId: task.sessionId, source: "manual", enteredById: actor.id },
          });
        }
        result = { ...result, reading: cfg.reading, values: Object.fromEntries(rows.map((r) => [r.dimension || "_", r.value])) };
        break;
      }
      case "rating": {
        const points = listFor(settings, task.checkConfig);
        if (!points.length) throw new UrbanInputError("This rating has no points configured — ask an admin");
        const marks = input.marks ?? {};
        const unrated = points.filter((p) => p.non_negotiable && !marks[p.key]);
        if (unrated.length) throw new UrbanInputError(`Rate every non-negotiable (${unrated.length} left)`);
        for (const p of points) if (marks[p.key] === "na" && !p.na_allowed) throw new UrbanInputError(`"${p.text}" can't be N/A`);
        const clean = Object.fromEntries(points.filter((p) => marks[p.key]).map((p) => [p.key, marks[p.key]]));
        for (const p of points) {
          if (p.non_negotiable && clean[p.key] === "fail" && !prevRaised[p.key]) raise.push({ title: `Fix: ${p.text}`, who: "partner", reasonKey: p.key });
        }
        const ok = Object.values(clean).filter((m) => m === "ok" || m === "na").length;
        result = { ...result, marks: clean, score: { ok, rated: Object.keys(clean).length, total: points.length } };
        break;
      }
      case "observation": {
        const points = listFor(settings, task.checkConfig);
        const flags = Object.fromEntries(Object.entries(input.flags ?? {}).filter(([k, v]) => points.some((p) => p.key === k) && (v === "gap" || v === "escalate")));
        for (const p of points) {
          if (flags[p.key] === "escalate" && !prevRaised[p.key]) raise.push({ title: `Caregiver practice: ${p.meta?.label ?? p.text}`, who: "partner", reasonKey: p.key });
        }
        result = { ...result, flags, gaps: Object.values(flags).filter((v) => v === "gap").length, escalated: Object.values(flags).filter((v) => v === "escalate").length };
        break;
      }
      default:
        throw new UrbanInputError(`Unknown check type "${task.checkType}"`);
    }

    // Follow-ups raised by a failed non-negotiable / an escalated practice. Remembered
    // in result.raised so redoing the same check never raises the same one twice.
    const raised: Record<string, string> = { ...prevRaised };
    const events: EventInput[] = [];
    for (const r of raise) {
      const f = await tx.uoTask.create({
        data: {
          effortId: task.effortId, kind: "followup", title: r.title, ownerId: task.effort.ownerId, who: r.who,
          due: toDb(addDays(today, FOLLOWUP_DAYS)), checkType: "tick", sourceTaskId: task.id, createdById: actor.id, sessionId: null,
        },
        select: { id: true },
      });
      raised[r.reasonKey] = f.id;
      events.push({ actorId: actor.id, entity: "task", entityId: f.id, action: "followup_raised", after: { title: r.title, who: r.who, from: task.title, auto: true } });
    }
    if (Object.keys(raised).length) result.raised = raised;

    await tx.uoTask.update({
      where: { id: task.id },
      data: { status: "done", doneAt: new Date(), doneById: actor.id, result: result as Prisma.InputJsonValue },
    });
    events.unshift({ actorId: actor.id, entity: "task", entityId: task.id, action: "completed", after: { title: task.title, checkType: task.checkType, ...stepIn(actor, task.effort.ownerId), ...(note ? { note } : {}) } });
    await logEvents(tx, events);
    return { followupsRaised: raise.length };
  });
}

// ── Undo / skip / reschedule ───────────────────────────────────────────────

export async function undoTask(actor: Actor, taskId: string, reason: string) {
  const why = reason.trim();
  if (!why) throw new UrbanInputError("Say why you're reopening it");
  await prisma.$transaction(async (tx) => {
    const { task } = await loadTaskCtx(tx, taskId);
    if (task.status === "open") throw new UrbanInputError("It's already open");
    // Keep result.raised so redoing the check doesn't duplicate follow-ups; readings stay as history.
    const raised = (task.result as { raised?: unknown } | null)?.raised;
    await tx.uoTask.update({ where: { id: task.id }, data: { status: "open", doneAt: null, doneById: null, result: raised ? ({ raised } as Prisma.InputJsonValue) : Prisma.DbNull } });
    await logEvent(tx, { actorId: actor.id, entity: "task", entityId: task.id, action: "reopened", before: { status: task.status, doneById: task.doneById }, reason: why, after: stepIn(actor, task.effort.ownerId) });
  });
}

export async function skipTask(actor: Actor, taskId: string, reason: string) {
  const why = reason.trim();
  if (!why) throw new UrbanInputError("Say why it's being skipped");
  await prisma.$transaction(async (tx) => {
    const { task } = await loadTaskCtx(tx, taskId);
    if (task.status !== "open") throw new UrbanInputError("Only an open item can be skipped");
    await tx.uoTask.update({ where: { id: task.id }, data: { status: "skipped", doneAt: new Date(), doneById: actor.id } });
    await logEvent(tx, { actorId: actor.id, entity: "task", entityId: task.id, action: "skipped", reason: why, after: stepIn(actor, task.effort.ownerId) });
  });
}

/** Move a due date. Needs a reason; the task stays in every list (rule R7) and sync never overwrites it. */
export async function rescheduleTask(actor: Actor, taskId: string, due: Ymd, reason: string) {
  const why = reason.trim();
  if (!why) throw new UrbanInputError("Say why it's moving");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new UrbanInputError("Pick a date");
  await prisma.$transaction(async (tx) => {
    const { task } = await loadTaskCtx(tx, taskId);
    if (task.status !== "open") throw new UrbanInputError("Only an open item can be rescheduled");
    await tx.uoTask.update({ where: { id: task.id }, data: { due: toDb(due), dueSource: "manual" } });
    await logEvent(tx, { actorId: actor.id, entity: "task", entityId: task.id, action: "rescheduled", before: { due: task.due }, after: { due, ...stepIn(actor, task.effort.ownerId) }, reason: why });
  });
}

// ── Follow-ups ─────────────────────────────────────────────────────────────

export async function addFollowup(actor: Actor, effortId: string, input: { title: string; who: "us" | "partner"; due: Ymd; sourceTaskId?: string | null }) {
  const title = input.title.trim();
  if (!title) throw new UrbanInputError("Say what needs following up");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.due)) throw new UrbanInputError("Pick a due date");
  if (input.who !== "us" && input.who !== "partner") throw new UrbanInputError("Say whose action it is");
  return prisma.$transaction(async (tx) => {
    const effort = await tx.uoEffort.findUnique({ where: { id: effortId }, select: { ownerId: true, closedAt: true } });
    if (!effort || effort.closedAt) throw new UrbanInputError("This effort is closed");
    if (input.sourceTaskId && !(await tx.uoTask.findFirst({ where: { id: input.sourceTaskId, effortId }, select: { id: true } }))) throw new UrbanInputError("Unknown source item");
    const f = await tx.uoTask.create({
      data: { effortId, kind: "followup", title, ownerId: effort.ownerId, who: input.who, due: toDb(input.due), checkType: "tick", sourceTaskId: input.sourceTaskId ?? null, createdById: actor.id },
      select: { id: true },
    });
    await logEvent(tx, { actorId: actor.id, entity: "task", entityId: f.id, action: "followup_raised", after: { title, who: input.who, due: input.due, ...stepIn(actor, effort.ownerId) } });
    return f.id;
  });
}

// ── Sessions (spec §4.1, §4.4) ─────────────────────────────────────────────

/** Start (or reopen the open) session of a routine for the current period. */
export async function startSession(actor: Actor, effortId: string, routineKey: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const effort = await tx.uoEffort.findUnique({ where: { id: effortId }, include: { programme: { select: { settings: true } } } });
    if (!effort || effort.closedAt) throw new UrbanInputError("This effort is closed");
    const parsed = parseSettings(effort.programme.settings);
    if (!parsed.ok) throw new UrbanInputError("The programme's settings are invalid — ask an admin");
    const routine = parsed.settings.routines.find((r) => r.key === routineKey);
    if (!routine) throw new UrbanInputError("Unknown routine");
    const setupOpen = await tx.uoTask.count({ where: { effortId, kind: "setup", required: true, status: "open" } });
    if (setupOpen > 0) throw new UrbanInputError(`Finish setup first (${setupOpen} required item${setupOpen === 1 ? "" : "s"} open)`);

    const period = periodFor(routine.cadence, todayIST());
    const existing = await tx.uoSession.findUnique({ where: { effortId_routineKey_period: { effortId, routineKey, period: period.key } } });
    if (existing) {
      if (existing.closedAt) throw new UrbanInputError(`${routine.name} is already done for this period`);
      return existing.id;
    }
    const session = await tx.uoSession.create({ data: { effortId, routineKey, period: period.key, mode: routine.mode, startedById: actor.id } });
    await tx.uoTask.createMany({
      data: routine.items.map((it, i) => ({
        effortId, kind: "session", sessionId: session.id, key: it.key, title: it.title, ownerId: effort.ownerId,
        due: toDb(period.end), required: it.required, checkType: it.check, checkConfig: (checkConfigFor(parsed.settings, it) ?? undefined) as never,
        sortOrder: i, createdById: actor.id,
      })),
    });
    await logEvent(tx, { actorId: actor.id, entity: "session", entityId: session.id, action: "started", after: { effortId, routine: routine.name, period: period.key, ...stepIn(actor, effort.ownerId) } });
    return session.id;
  });
}

export async function arriveSession(actor: Actor, sessionId: string) {
  await prisma.$transaction(async (tx) => {
    const s = await tx.uoSession.findUnique({ where: { id: sessionId } });
    if (!s || s.closedAt) throw new UrbanInputError("That session is closed");
    if (s.arrivedAt) return;
    await tx.uoSession.update({ where: { id: sessionId }, data: { arrivedAt: new Date() } });
    await logEvent(tx, { actorId: actor.id, entity: "session", entityId: sessionId, action: "arrived" });
  });
}

/**
 * Close a session. With required items still open it needs a reason, and those items
 * become follow-ups (owned by us, due in a week) so nothing is lost (spec §4.4).
 */
export async function closeSession(actor: Actor, sessionId: string, note: string): Promise<{ carried: number }> {
  return prisma.$transaction(async (tx) => {
    const s = await tx.uoSession.findUnique({ where: { id: sessionId }, include: { tasks: { where: { status: "open" } }, effort: { select: { ownerId: true } } } });
    if (!s || s.closedAt) throw new UrbanInputError("That session is already closed");
    const why = note.trim();
    const requiredOpen = s.tasks.filter((t) => t.required);
    if (requiredOpen.length && !why) throw new UrbanInputError(`${requiredOpen.length} required item${requiredOpen.length === 1 ? " is" : "s are"} still open — add a reason to close early`);
    if (s.mode === "visit" && !s.arrivedAt) throw new UrbanInputError("Mark \"I've reached\" before closing a visit");

    const today = todayIST();
    const events: EventInput[] = [];
    for (const t of s.tasks) {
      await tx.uoTask.update({ where: { id: t.id }, data: { status: "skipped", doneAt: new Date(), doneById: actor.id } });
      events.push({ actorId: actor.id, entity: "task", entityId: t.id, action: "skipped", reason: "Session closed with this item open" });
      if (t.required) {
        const f = await tx.uoTask.create({
          data: { effortId: s.effortId, kind: "followup", title: t.title, ownerId: s.effort.ownerId, who: "us", due: toDb(addDays(today, FOLLOWUP_DAYS)), checkType: t.checkType, checkConfig: (t.checkConfig ?? undefined) as never, sourceTaskId: t.id, createdById: actor.id },
          select: { id: true },
        });
        events.push({ actorId: actor.id, entity: "task", entityId: f.id, action: "followup_raised", after: { title: t.title, who: "us", carriedFromSession: sessionId } });
      }
    }
    await tx.uoSession.update({ where: { id: sessionId }, data: { closedAt: new Date(), closedById: actor.id, closedNote: why || null } });
    events.unshift({ actorId: actor.id, entity: "session", entityId: sessionId, action: requiredOpen.length ? "closed_early" : "closed", reason: why || null, after: { carried: requiredOpen.length, ...stepIn(actor, s.effort.ownerId) } });
    await logEvents(tx, events);
    return { carried: requiredOpen.length };
  });
}

/** The effort a task / session belongs to — callers authorise on this before acting. */
export async function effortIdOfTask(taskId: string): Promise<string | null> {
  return (await prisma.uoTask.findUnique({ where: { id: taskId }, select: { effortId: true } }))?.effortId ?? null;
}
export async function effortIdOfSession(sessionId: string): Promise<string | null> {
  return (await prisma.uoSession.findUnique({ where: { id: sessionId }, select: { effortId: true } }))?.effortId ?? null;
}
