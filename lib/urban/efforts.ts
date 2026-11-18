// Efforts and their setup tasks (spec §3, §4.2, rule R5).
//
//   createEffort      — validates against the programme, generates setup tasks.
//   syncProgramme     — after a settings save: open setup tasks follow the new
//                       settings; done / skipped tasks never change; items that
//                       were removed close their open tasks as "skipped" with a
//                       reason. There is no resync button: saving IS the sync.
//
// Callers authorise first (lib/urban/access). Everything here runs inside one
// transaction and logs Events (rule R4).
import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { logEvent, logEvents, type EventInput } from "./events";
import { parseSettings, setupItemsFor, checkConfigFor, type ProgrammeSettings, type StartMode } from "./settings";
import { addDays, fromDb, toDb, type Ymd } from "./time";

type Tx = Prisma.TransactionClient;

export class UrbanInputError extends Error {}

function settingsOf(raw: unknown): ProgrammeSettings {
  const r = parseSettings(raw);
  if (!r.ok) throw new UrbanInputError(`Programme settings are invalid: ${r.errors[0]}`);
  return r.settings;
}

export type NewEffort = {
  programmeId: string;
  placeId: string;
  partnerId: string | null;
  ownerId: string;
  title: string;
  startMode: StartMode;
  startedOn: Ymd;
};

export async function createEffort(actorId: string, input: NewEffort): Promise<{ id: string; setupTasks: number }> {
  return prisma.$transaction(async (tx) => {
    const programme = await tx.uoProgramme.findUnique({ where: { id: input.programmeId } });
    if (!programme || !programme.active) throw new UrbanInputError("Pick an active programme");
    const s = settingsOf(programme.settings);

    const place = await tx.uoPlace.findUnique({ where: { id: input.placeId }, select: { id: true, level: true, active: true } });
    if (!place || !place.active) throw new UrbanInputError("Pick a place");
    if (place.level !== s.place_level) throw new UrbanInputError(`${programme.name} efforts sit at ${s.place_level} level; that place is a ${place.level}`);

    if (input.partnerId) {
      const p = await tx.uoPartner.findUnique({ where: { id: input.partnerId }, select: { active: true } });
      if (!p?.active) throw new UrbanInputError("Pick an active partner");
    } else if (!s.partner_optional) {
      throw new UrbanInputError(`${programme.name} needs a partner`);
    }

    const title = input.title.trim();
    if (!title) throw new UrbanInputError("Give the effort a name");

    const effort = await tx.uoEffort.create({
      data: {
        programmeId: programme.id, placeId: place.id, partnerId: input.partnerId, ownerId: input.ownerId,
        title, startMode: input.startMode, startedOn: toDb(input.startedOn), createdById: actorId,
      },
    });

    const items = setupItemsFor(s, input.startMode);
    if (items.length) {
      await tx.uoTask.createMany({
        data: items.map((it) => ({
          effortId: effort.id, kind: "setup", key: it.key, phase: it.phase, title: it.title,
          ownerId: input.ownerId, due: toDb(addDays(input.startedOn, it.dueDay)),
          required: it.required, checkType: it.check, checkConfig: (checkConfigFor(s, it) ?? undefined) as never,
          sortOrder: it.order, createdById: actorId,
        })),
      });
    }

    await logEvent(tx, {
      actorId, entity: "effort", entityId: effort.id, action: "created",
      after: { ...input, programme: programme.key, programmeVersion: programme.version, setupTasks: items.length },
    });
    return { id: effort.id, setupTasks: items.length };
  });
}

export type SyncSummary = { efforts: number; updated: number; added: number; skipped: number };

/**
 * Bring every open effort of a programme in line with its (just saved) settings.
 * Only OPEN setup tasks change. A due date someone set by hand (dueSource=manual) is kept.
 */
export async function syncProgramme(tx: Tx, programmeId: string, actorId: string): Promise<SyncSummary> {
  const programme = await tx.uoProgramme.findUniqueOrThrow({ where: { id: programmeId } });
  const s = settingsOf(programme.settings);
  const efforts = await tx.uoEffort.findMany({
    where: { programmeId, closedAt: null },
    select: { id: true, startMode: true, startedOn: true, ownerId: true, tasks: { where: { kind: "setup" }, select: { id: true, key: true, status: true, title: true, phase: true, checkType: true, required: true, sortOrder: true, due: true, dueSource: true, checkConfig: true } } },
  });

  const summary: SyncSummary = { efforts: efforts.length, updated: 0, added: 0, skipped: 0 };
  const events: EventInput[] = [];

  for (const e of efforts) {
    const items = setupItemsFor(s, e.startMode as StartMode);
    const wanted = new Map(items.map((it) => [it.key, it]));
    const byKey = new Map(e.tasks.map((t) => [t.key, t]));
    const start = fromDb(e.startedOn);

    for (const it of items) {
      const t = byKey.get(it.key);
      const autoDue = toDb(addDays(start, it.dueDay));
      if (!t) {
        const created = await tx.uoTask.create({
          data: {
            effortId: e.id, kind: "setup", key: it.key, phase: it.phase, title: it.title, ownerId: e.ownerId,
            due: autoDue, required: it.required, checkType: it.check, checkConfig: (checkConfigFor(s, it) ?? undefined) as never,
            sortOrder: it.order, createdById: actorId,
          },
          select: { id: true },
        });
        events.push({ actorId, entity: "task", entityId: created.id, action: "added_by_programme", after: { key: it.key, programmeVersion: programme.version } });
        summary.added++;
        continue;
      }
      if (t.status !== "open") continue; // done work never changes
      const next = {
        title: it.title, phase: it.phase, checkType: it.check, required: it.required, sortOrder: it.order,
        ...(t.dueSource === "auto" ? { due: autoDue } : {}),
      };
      const changed =
        t.title !== next.title || t.phase !== next.phase || t.checkType !== next.checkType ||
        t.required !== next.required || t.sortOrder !== next.sortOrder ||
        (t.dueSource === "auto" && t.due?.getTime() !== autoDue.getTime());
      const cfg = checkConfigFor(s, it);
      const cfgChanged = JSON.stringify(cfg ?? null) !== JSON.stringify(t.checkConfig ?? null);
      if (!changed && !cfgChanged) continue;
      await tx.uoTask.update({ where: { id: t.id }, data: { ...next, checkConfig: (cfg ?? Prisma.DbNull) as never } });
      if (changed) {
        events.push({ actorId, entity: "task", entityId: t.id, action: "updated_by_programme", before: { title: t.title, checkType: t.checkType, required: t.required }, after: { ...next, programmeVersion: programme.version } });
        summary.updated++;
      }
    }

    for (const t of e.tasks) {
      if (t.status === "open" && t.key && !wanted.has(t.key)) {
        await tx.uoTask.update({ where: { id: t.id }, data: { status: "skipped", doneAt: new Date(), doneById: actorId } });
        events.push({ actorId, entity: "task", entityId: t.id, action: "skipped", reason: `Removed from ${programme.name} settings (v${programme.version})` });
        summary.skipped++;
      }
    }
  }

  await logEvents(tx, events);
  return summary;
}
