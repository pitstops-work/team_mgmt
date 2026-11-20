"use server";

// Admin actions: programmes, places, partners, assignments. Every exported
// action starts with requireActorForAction() + authorize() (enforced by
// scripts/check-urban-access.mjs) and logs an Event.
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireActorForAction, authorize, UrbanAccessError } from "@/lib/urban/access";
import { logEvent } from "@/lib/urban/events";
import { syncProgramme, UrbanInputError, type SyncSummary } from "@/lib/urban/efforts";
import { importPlaces, importPartners, type ImportSummary } from "@/lib/urban/places";
import { parseSettings } from "@/lib/urban/settings";
import { STARTER_PROGRAMMES } from "@/lib/urban/starter";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UrbanAccessError || e instanceof UrbanInputError) return { ok: false, error: e.message };
  console.error("[urban] admin action failed", e);
  return { ok: false, error: "Something went wrong — nothing was saved." };
}

const done = () => revalidatePath("/urban", "layout");

// ── Programmes ─────────────────────────────────────────────────────────────

export async function loadStarterProgramme(key: string): Promise<Result> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "programme.edit");
    const starter = STARTER_PROGRAMMES.find((p) => p.key === key);
    if (!starter) throw new UrbanInputError("Unknown starter programme");
    if (await prisma.uoProgramme.findUnique({ where: { key }, select: { id: true } })) throw new UrbanInputError(`"${starter.name}" is already loaded`);
    const parsed = parseSettings(JSON.parse(JSON.stringify(starter.settings)));
    if (!parsed.ok) throw new UrbanInputError(`Starter settings are invalid: ${parsed.errors[0]}`);
    await prisma.$transaction(async (tx) => {
      const p = await tx.uoProgramme.create({ data: { key, name: starter.name, settings: parsed.settings as never } });
      await logEvent(tx, { actorId: actor.id, entity: "programme", entityId: p.id, action: "created", after: { key, name: starter.name, version: 1, settings: parsed.settings } });
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Save settings. Saving IS the sync: open setup tasks follow; done work never changes (rule R5). */
export async function saveProgramme(id: string, input: { name: string; settingsJson: string }): Promise<Result<SyncSummary>> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "programme.edit");
    const name = input.name.trim();
    if (!name) throw new UrbanInputError("Give the programme a name");
    const parsed = parseSettings(input.settingsJson);
    if (!parsed.ok) throw new UrbanInputError(parsed.errors.slice(0, 3).join(" · "));

    const summary = await prisma.$transaction(async (tx) => {
      const before = await tx.uoProgramme.findUniqueOrThrow({ where: { id } });
      const p = await tx.uoProgramme.update({ where: { id }, data: { name, settings: parsed.settings as never, version: { increment: 1 } } });
      await logEvent(tx, { actorId: actor.id, entity: "programme", entityId: id, action: "saved", before: { name: before.name, version: before.version, settings: before.settings }, after: { name, version: p.version, settings: parsed.settings } });
      return syncProgramme(tx, id, actor.id);
    }, { timeout: 120_000 });
    done();
    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}

export async function setProgrammeActive(id: string, active: boolean): Promise<Result> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "programme.edit");
    await prisma.$transaction(async (tx) => {
      await tx.uoProgramme.update({ where: { id }, data: { active } });
      await logEvent(tx, { actorId: actor.id, entity: "programme", entityId: id, action: active ? "activated" : "deactivated" });
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Places & partners ──────────────────────────────────────────────────────

export async function importPlacesAction(): Promise<Result<ImportSummary>> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "setup.edit");
    const summary = await importPlaces(actor.id);
    done();
    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}

export async function importPartnersAction(): Promise<Result<{ added: number; updated: number }>> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "setup.edit");
    const summary = await importPartners(actor.id);
    done();
    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}

export async function addSite(input: { settlementId: string; name: string; lat?: number | null; lng?: number | null }): Promise<Result<{ id: string }>> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "setup.edit");
    const name = input.name.trim();
    if (!name) throw new UrbanInputError("Give the site a name");
    const parent = await prisma.uoPlace.findUnique({ where: { id: input.settlementId }, select: { level: true, lat: true, lng: true } });
    if (parent?.level !== "settlement") throw new UrbanInputError("A site sits under a settlement");
    const site = await prisma.$transaction(async (tx) => {
      const s = await tx.uoPlace.create({ data: { level: "site", name, parentId: input.settlementId, lat: input.lat ?? parent.lat, lng: input.lng ?? parent.lng } });
      await logEvent(tx, { actorId: actor.id, entity: "place", entityId: s.id, action: "created", after: { level: "site", name, parentId: input.settlementId } });
      return s;
    });
    done();
    return { ok: true, data: { id: site.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function savePartner(input: { id?: string; name: string; mis: string; active?: boolean }): Promise<Result> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "setup.edit");
    const name = input.name.trim();
    if (!name) throw new UrbanInputError("Give the partner a name");
    const clash = await prisma.uoPartner.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) }, select: { id: true } });
    if (clash) throw new UrbanInputError(`A partner called "${name}" already exists`);
    await prisma.$transaction(async (tx) => {
      const data = { name, mis: input.mis.trim() || null, ...(input.active === undefined ? {} : { active: input.active }) };
      if (input.id) {
        const before = await tx.uoPartner.findUniqueOrThrow({ where: { id: input.id } });
        await tx.uoPartner.update({ where: { id: input.id }, data });
        await logEvent(tx, { actorId: actor.id, entity: "partner", entityId: input.id, action: "updated", before: { name: before.name, mis: before.mis, active: before.active }, after: data });
      } else {
        const p = await tx.uoPartner.create({ data });
        await logEvent(tx, { actorId: actor.id, entity: "partner", entityId: p.id, action: "created", after: data });
      }
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Assignments ────────────────────────────────────────────────────────────

export async function addAssignment(input: { userId: string; placeId: string; programmeKey: string }): Promise<Result> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "setup.edit");
    const [user, place] = await Promise.all([
      prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } }),
      prisma.uoPlace.findUnique({ where: { id: input.placeId }, select: { id: true } }),
    ]);
    if (!user || !place) throw new UrbanInputError("Pick a person and a place");
    const programmeKey = input.programmeKey.trim();
    if (programmeKey && !(await prisma.uoProgramme.findUnique({ where: { key: programmeKey }, select: { id: true } }))) throw new UrbanInputError("Unknown programme");
    await prisma.$transaction(async (tx) => {
      const a = await tx.uoAssignment.upsert({
        where: { userId_placeId_programmeKey: { userId: input.userId, placeId: input.placeId, programmeKey } },
        create: { userId: input.userId, placeId: input.placeId, programmeKey },
        update: {},
      });
      await logEvent(tx, { actorId: actor.id, entity: "assignment", entityId: a.id, action: "added", after: { ...input, programmeKey } });
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeAssignment(id: string): Promise<Result> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "setup.edit");
    await prisma.$transaction(async (tx) => {
      const a = await tx.uoAssignment.findUnique({ where: { id } });
      if (!a) return;
      await tx.uoAssignment.delete({ where: { id } });
      await logEvent(tx, { actorId: actor.id, entity: "assignment", entityId: id, action: "removed", before: { userId: a.userId, placeId: a.placeId, programmeKey: a.programmeKey } });
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Members (who may open /urban besides admins) ───────────────────────────

export async function setMember(userId: string, on: boolean): Promise<Result> {
  try {
    const actor = await requireActorForAction();
    await authorize(actor, "setup.edit");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new UrbanInputError("That person no longer exists");
    await prisma.$transaction(async (tx) => {
      const cur = await tx.uoMember.findUnique({ where: { userId } });
      if (on && !cur) await tx.uoMember.create({ data: { userId, addedById: actor.id } });
      else if (!on && cur) await tx.uoMember.delete({ where: { userId } });
      else return;
      await logEvent(tx, { actorId: actor.id, entity: "member", entityId: userId, action: on ? "added" : "removed" });
    });
    done();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
