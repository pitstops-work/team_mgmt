"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getSeedingAccess, canEditTask, canEditFunnelGeo } from "@/lib/seeding/access";
import type { SeedingTaskStatus } from "@/app/generated/prisma/client";

async function access() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  return { session, a: await getSeedingAccess(session) };
}

function revalidateAll() {
  revalidatePath("/seeding");
  revalidatePath("/seeding/workstreams");
  revalidatePath("/seeding/my");
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export type TaskInput = {
  title: string;
  detail?: string | null;
  ownerRole?: string | null;
  supportRoles?: string | null;
  startWeek?: number | null;
  dueWeek?: number | null;
  dependsOn?: string | null;
  doneMetric?: string | null;
  status?: SeedingTaskStatus;
  notes?: string | null;
  phaseId?: string | null;
  code?: string | null;
};

export async function createSeedingTask(workstreamId: string, input: TaskInput) {
  const { session, a } = await access();
  if (!a.canEdit) throw new Error("No edit access");
  // Owner-role edit gate: geo members may only add tasks they could edit.
  if (!canEditTask(a, { ownerRole: input.ownerRole ?? null })) throw new Error("Not allowed for this owner");
  const max = await prisma.seedingTask.aggregate({ where: { workstreamId }, _max: { sortOrder: true } });
  await prisma.seedingTask.create({
    data: {
      workstreamId,
      phaseId: input.phaseId ?? null,
      title: input.title.trim(),
      detail: input.detail?.trim() || null,
      ownerRole: input.ownerRole?.trim() || null,
      supportRoles: input.supportRoles?.trim() || null,
      startWeek: input.startWeek ?? null,
      dueWeek: input.dueWeek ?? null,
      dependsOn: input.dependsOn?.trim() || null,
      doneMetric: input.doneMetric?.trim() || null,
      status: input.status ?? "not_started",
      notes: input.notes?.trim() || null,
      code: input.code?.trim() || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      createdById: session.user!.id!,
    },
  });
  revalidateAll();
}

export async function updateSeedingTask(taskId: string, input: TaskInput) {
  const { a } = await access();
  const task = await prisma.seedingTask.findUnique({ where: { id: taskId }, select: { ownerRole: true } });
  if (!task) throw new Error("Not found");
  if (!canEditTask(a, task)) throw new Error("No edit access");
  await prisma.seedingTask.update({
    where: { id: taskId },
    data: {
      title: input.title.trim(),
      detail: input.detail?.trim() || null,
      ownerRole: input.ownerRole?.trim() || null,
      supportRoles: input.supportRoles?.trim() || null,
      startWeek: input.startWeek ?? null,
      dueWeek: input.dueWeek ?? null,
      dependsOn: input.dependsOn?.trim() || null,
      doneMetric: input.doneMetric?.trim() || null,
      status: input.status ?? undefined,
      notes: input.notes?.trim() || null,
      phaseId: input.phaseId ?? null,
      code: input.code?.trim() || null,
    },
  });
  revalidateAll();
}

/** Fast status-only update (used by the inline status control). */
export async function setSeedingTaskStatus(taskId: string, status: SeedingTaskStatus, note?: string) {
  const { a } = await access();
  const task = await prisma.seedingTask.findUnique({ where: { id: taskId }, select: { ownerRole: true } });
  if (!task) throw new Error("Not found");
  if (!canEditTask(a, task)) throw new Error("No edit access");
  await prisma.seedingTask.update({
    where: { id: taskId },
    data: { status, ...(note !== undefined ? { notes: note.trim() || null } : {}) },
  });
  revalidateAll();
}

export async function deleteSeedingTask(taskId: string) {
  const { a } = await access();
  const task = await prisma.seedingTask.findUnique({ where: { id: taskId }, select: { ownerRole: true } });
  if (!task) throw new Error("Not found");
  if (!canEditTask(a, task)) throw new Error("No edit access");
  await prisma.seedingTask.delete({ where: { id: taskId } });
  revalidateAll();
}

// ── Phases ──────────────────────────────────────────────────────────────────

export async function createSeedingPhase(workstreamId: string, label: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No structure access");
  const max = await prisma.seedingPhase.aggregate({ where: { workstreamId }, _max: { sortOrder: true } });
  await prisma.seedingPhase.create({ data: { workstreamId, label: label.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  revalidateAll();
}

export async function renameSeedingPhase(phaseId: string, label: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No structure access");
  await prisma.seedingPhase.update({ where: { id: phaseId }, data: { label: label.trim() } });
  revalidateAll();
}

export async function deleteSeedingPhase(phaseId: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No structure access");
  // Tasks keep existing (phaseId set null via FK). Delete the grouping only.
  await prisma.seedingPhase.delete({ where: { id: phaseId } });
  revalidateAll();
}

// ── Workstreams ─────────────────────────────────────────────────────────────

export async function createSeedingWorkstream(key: string, label: string, color?: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No structure access");
  const max = await prisma.seedingWorkstream.aggregate({ _max: { sortOrder: true } });
  await prisma.seedingWorkstream.create({
    data: { key: key.trim(), label: label.trim(), color: color?.trim() || "#6366f1", sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  revalidateAll();
}

export async function updateSeedingWorkstream(id: string, label: string, color?: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No structure access");
  await prisma.seedingWorkstream.update({ where: { id }, data: { label: label.trim(), ...(color ? { color: color.trim() } : {}) } });
  revalidateAll();
}

export async function archiveSeedingWorkstream(id: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No structure access");
  await prisma.seedingWorkstream.delete({ where: { id } }); // cascades phases + tasks
  revalidateAll();
}

// ── Funnel ──────────────────────────────────────────────────────────────────

export type FunnelGeoInput = { reachToDate?: number; leadsToDate?: number; appsReceived?: number; screened?: number; shortlisted?: number };

export async function updateSeedingFunnelGeo(geoId: string, input: FunnelGeoInput) {
  const { a } = await access();
  if (!canEditFunnelGeo(a, geoId)) throw new Error("No funnel access for this geo");
  const clean = Object.fromEntries(
    Object.entries(input).filter(([, v]) => typeof v === "number" && v >= 0).map(([k, v]) => [k, Math.round(v as number)]),
  );
  await prisma.seedingFunnelGeo.update({ where: { geoId }, data: clean });
  revalidatePath("/seeding/funnel");
  revalidatePath("/seeding");
}

export async function updateSeedingFunnelConfig(input: Partial<{ fellowsPerGeo: number; selectionRatio: number; appBufferPct: number; leadToApp: number; coldReachToApp: number; reachToLead: number; shareFromWarm: number }>) {
  const { a } = await access();
  if (!a.isCentral) throw new Error("Only central roles can change funnel assumptions");
  await prisma.seedingFunnelConfig.update({ where: { id: 1 }, data: input });
  revalidatePath("/seeding/funnel");
  revalidatePath("/seeding");
}

// ── Members (admin) ─────────────────────────────────────────────────────────

export async function addSeedingMember(userId: string, role: string, geoId: string | null) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No admin access");
  // Manual find-or-create: Prisma can't use a nullable field in a compound
  // unique `where`, so we can't upsert on [userId, role, geoId] directly.
  const existing = await prisma.seedingMember.findFirst({ where: { userId, role, geoId } });
  if (!existing) await prisma.seedingMember.create({ data: { userId, role, geoId } });
  revalidatePath("/seeding/admin/members");
}

export async function removeSeedingMember(id: string) {
  const { a } = await access();
  if (!a.canManageStructure) throw new Error("No admin access");
  await prisma.seedingMember.delete({ where: { id } });
  revalidatePath("/seeding/admin/members");
}
