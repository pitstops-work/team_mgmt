"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext, can } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import type { Horizon, ModelGroup, ModelNode, ModelOutput } from "@/lib/models/types";

async function assertCanEditTemplate() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const ctx = await buildRbacContext(session);
  if (!(await can(ctx, "operating_model_template", "update"))) throw new Error("Forbidden: admin only");
  return session;
}

export async function updateTemplateMeta(
  id: string,
  meta: { name?: string; description?: string; horizons?: Horizon[]; sortOrder?: number; isActive?: boolean },
) {
  await assertCanEditTemplate();
  await prisma.modelTemplate.update({
    where: { id },
    data: {
      ...(meta.name !== undefined ? { name: meta.name.trim() } : {}),
      ...(meta.description !== undefined ? { description: meta.description } : {}),
      ...(meta.horizons !== undefined ? { horizons: meta.horizons as never } : {}),
      ...(meta.sortOrder !== undefined ? { sortOrder: meta.sortOrder } : {}),
      ...(meta.isActive !== undefined ? { isActive: meta.isActive } : {}),
    },
  });
  revalidatePath(`/models/templates/${id}`);
  revalidatePath(`/models/templates`);
  revalidatePath(`/models`);
}

/**
 * Replace the template's groups/nodes/outputs in one transactional swap.
 * Keeps the template row + instances. Same pattern the seed scripts use.
 *
 * Validates uniqueness of keys client-side too; this is the last line of defence.
 */
export async function replaceTemplateContent(
  id: string,
  payload: {
    groups: Array<Pick<ModelGroup, "key" | "label" | "order">>;
    nodes: Array<Pick<ModelNode, "key" | "label" | "notes" | "unit" | "kind" | "dataType" | "shape" | "default" | "formula" | "groupKey" | "order">>;
    outputs: Array<Pick<ModelOutput, "key" | "label" | "kind" | "config" | "order">>;
  },
) {
  await assertCanEditTemplate();

  // Key uniqueness checks.
  const seen = new Set<string>();
  for (const g of payload.groups) { if (seen.has(`g:${g.key}`)) throw new Error(`Duplicate group key '${g.key}'`); seen.add(`g:${g.key}`); }
  seen.clear();
  for (const n of payload.nodes) { if (seen.has(`n:${n.key}`)) throw new Error(`Duplicate node key '${n.key}'`); seen.add(`n:${n.key}`); }
  seen.clear();
  for (const o of payload.outputs) { if (seen.has(`o:${o.key}`)) throw new Error(`Duplicate output key '${o.key}'`); seen.add(`o:${o.key}`); }

  await prisma.$transaction(async (tx) => {
    // Wipe children. Nodes reference groups via groupId; nodes also referenced
    // by nothing else. Cascade fine.
    await tx.modelOutput.deleteMany({ where: { templateId: id } });
    await tx.modelNode.deleteMany({ where: { templateId: id } });
    await tx.modelGroup.deleteMany({ where: { templateId: id } });

    // Create groups → map keys to ids.
    const groupKeyToId = new Map<string, string>();
    for (const g of payload.groups) {
      const row = await tx.modelGroup.create({
        data: { templateId: id, key: g.key, label: g.label, order: g.order ?? 0 },
      });
      groupKeyToId.set(g.key, row.id);
    }

    // Create nodes.
    for (const n of payload.nodes) {
      await tx.modelNode.create({
        data: {
          templateId: id,
          groupId: n.groupKey ? groupKeyToId.get(n.groupKey) ?? null : null,
          key: n.key, label: n.label, notes: n.notes ?? null, unit: n.unit ?? null,
          kind: n.kind, dataType: n.dataType,
          shape: (n.shape ?? { kind: "scalar" }) as never,
          defaultJson: n.default === undefined ? undefined : (n.default as never),
          formula: n.formula ?? null,
          order: n.order ?? 0,
        },
      });
    }

    // Create outputs.
    for (const o of payload.outputs) {
      await tx.modelOutput.create({
        data: { templateId: id, key: o.key, label: o.label, kind: o.kind, config: (o.config ?? {}) as never, order: o.order ?? 0 },
      });
    }
  }, { timeout: 30_000 });

  revalidatePath(`/models/templates/${id}`);
  revalidatePath(`/models/templates`);
}

export async function deleteTemplate(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const ctx = await buildRbacContext(session);
  if (!(await can(ctx, "operating_model_template", "delete"))) throw new Error("Forbidden");
  await prisma.modelTemplate.delete({ where: { id } });
  revalidatePath(`/models/templates`);
  revalidatePath(`/models`);
}

export async function createTemplate(name: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  const ctx = await buildRbacContext(session);
  if (!(await can(ctx, "operating_model_template", "create"))) throw new Error("Forbidden");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name required");
  const key = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "template";
  // Ensure unique key.
  let finalKey = key; let n = 1;
  while (await prisma.modelTemplate.findUnique({ where: { key: finalKey } })) {
    finalKey = `${key}_${++n}`;
  }
  const t = await prisma.modelTemplate.create({
    data: {
      key: finalKey, name: trimmed,
      horizons: [{ key: "monthly", length: 60 }, { key: "annual", length: 5 }],
    },
  });
  revalidatePath(`/models/templates`);
  return { id: t.id };
}
