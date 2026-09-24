// Edit or delete one step template (setup or visit). `kind` selects the table.
//   PATCH { kind, title?, phaseTag?, slaDays?, startSlaDays?, blockedByKey?, formKind?, mandatory? }
//   PATCH { kind, stepKey }  → RENAME (see renameStepKey below)
//   DELETE ?kind=setup|visit
import { NextRequest } from "next/server";
import { logField, logFieldChanges, diffChanges } from "@/lib/field/audit";
import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { requireFieldAdmin } from "@/lib/field/access";
import { renameStepKey, slugStepKey } from "@/lib/field/templateKeys";

function pickModel(kind: string) {
  return kind === "visit" ? prisma.visitStepTemplate : prisma.setupStepTemplate;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actorId = await requireFieldAdmin();
  if (!actorId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const kind: "setup" | "visit" = b.kind === "visit" ? "visit" : "setup";
  const model = pickModel(kind) as any;

  // Rename is its own operation — never a side-effect of editing the title.
  if (typeof b.stepKey === "string") {
    const next = slugStepKey(b.stepKey);
    if (!next) return Response.json({ error: "A step key needs at least one letter or digit" }, { status: 400 });
    const res = await renameStepKey({ id, kind, next, actorId });
    if ("error" in res) return Response.json({ error: res.error }, { status: res.status });
    return Response.json(res);
  }

  const data: Record<string, unknown> = {};
  if (typeof b.title === "string") data.title = b.title;
  if (b.formKind === null || ["checklist", "questionnaire", "caregiver_practices"].includes(b.formKind)) data.formKind = b.formKind || null;
  // Full form schema (checklist items / questionnaire fields). null clears it.
  // Prisma ignores `undefined`, so clearing needs DbNull — passing undefined
  // here meant a form schema could never actually be removed.
  if (b.formSchema !== undefined) data.formSchema = b.formSchema === null ? Prisma.DbNull : b.formSchema;
  // setup-only fields
  if (b.slaDays === null || Number.isFinite(b.slaDays)) data.slaDays = b.slaDays;
  if (b.startSlaDays === null || Number.isFinite(b.startSlaDays)) data.startSlaDays = b.startSlaDays;
  if (b.blockedByKey === null || typeof b.blockedByKey === "string") data.blockedByKey = b.blockedByKey || null;
  if (b.phaseTag === null || typeof b.phaseTag === "string") data.phaseTag = b.phaseTag || null;
  // visit-only field
  if (typeof b.mandatory === "boolean") data.mandatory = b.mandatory;

  // Drop keys that don't exist on the chosen table to avoid Prisma errors.
  if (kind === "visit") { delete data.slaDays; delete data.startSlaDays; delete data.blockedByKey; delete data.phaseTag; }
  else delete data.mandatory;

  const before = await model.findUnique({ where: { id } });
  await model.update({ where: { id }, data });
  if (before) {
    logFieldChanges("FieldTemplate", id, actorId, `${kind}_step_updated`,
      diffChanges(before as Record<string, unknown>, data));
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actorId = await requireFieldAdmin();
  if (!actorId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind") ?? "setup";
  // Read it first: a hard delete leaves nothing to identify the row afterwards,
  // and stepKey is the resync identity, so losing it silently matters.
  const before = await (pickModel(kind) as any).findUnique({ where: { id } });
  await (pickModel(kind) as any).delete({ where: { id } });
  if (before) {
    logField("FieldTemplate", id, actorId, `${kind}_step_deleted`, {
      field: before.domain, from: { stepKey: before.stepKey, title: before.title }, to: null,
    });
  }
  return Response.json({ ok: true });
}
