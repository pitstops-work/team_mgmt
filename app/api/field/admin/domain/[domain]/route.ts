// Edit a FieldDomainConfig (label / geo unit / cadence / overall SLA / live phase).
//   PATCH { label?, unit?, overallSlaDays?, cadenceCount?, cadencePeriod?, hasLivePhase?, caregiverForm?, isActive? }
//   DELETE — remove the domain config (only when it has no interventions).
import { NextRequest } from "next/server";
import { logField, logFieldChanges, diffChanges } from "@/lib/field/audit";
import prisma from "@/lib/prisma";
import { requireFieldAdmin } from "@/lib/field/access";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const actorId = await requireFieldAdmin();
  if (!actorId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { domain } = await params;
  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof b.label === "string") data.label = b.label;
  if (b.unit === "settlement" || b.unit === "cluster") data.unit = b.unit;
  if (b.cadencePeriod === "week" || b.cadencePeriod === "month" || b.cadencePeriod === null) data.cadencePeriod = b.cadencePeriod;
  if (b.overallSlaDays === null || Number.isFinite(b.overallSlaDays)) data.overallSlaDays = b.overallSlaDays;
  if (b.cadenceCount === null || Number.isFinite(b.cadenceCount)) data.cadenceCount = b.cadenceCount;
  if (typeof b.hasLivePhase === "boolean") data.hasLivePhase = b.hasLivePhase;
  if (typeof b.caregiverForm === "boolean") {
    // Caregiver capture files observations against a facility + settlement. With
    // no facility layer mapped to the domain there is no facility picker, so the
    // form would be offered and then refuse every write. Refuse the toggle instead.
    if (b.caregiverForm) {
      const layer = await prisma.facilityLayerConfig.findFirst({ where: { needsDomain: domain, isActive: true }, select: { layerKey: true } });
      if (!layer) {
        return Response.json(
          { error: `${domain} has no facility layer, so caregiver observations would have nowhere to file. Map a layer to this domain in Settings → Facility layers first.` },
          { status: 409 },
        );
      }
    }
    data.caregiverForm = b.caregiverForm;
  }
  if (typeof b.isActive === "boolean") data.isActive = b.isActive;

  // Diff against the stored row so the log records what actually changed,
  // not the whole payload.
  const before = await prisma.fieldDomainConfig.findUnique({ where: { domain } });
  await prisma.fieldDomainConfig.update({ where: { domain }, data });
  if (before) logFieldChanges("FieldDomain", domain, actorId, "updated", diffChanges(before as unknown as Record<string, unknown>, data));
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const actorId = await requireFieldAdmin();
  if (!actorId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { domain } = await params;
  const inUse = await prisma.goal.count({ where: { needsDomain: domain, deletedAt: null, fieldSteps: { some: {} } } });
  if (inUse > 0) return Response.json({ error: `In use by ${inUse} intervention(s) — deactivate instead` }, { status: 409 });
  // Hard delete of the domain AND its whole recipe — record what was destroyed.
  const setup = await prisma.setupStepTemplate.count({ where: { domain } });
  const visit = await prisma.visitStepTemplate.count({ where: { domain } });
  await prisma.setupStepTemplate.deleteMany({ where: { domain } });
  await prisma.visitStepTemplate.deleteMany({ where: { domain } });
  await prisma.fieldDomainConfig.delete({ where: { domain } });
  logField("FieldDomain", domain, actorId, "deleted", { field: "templates", from: { setup, visit }, to: null });
  return Response.json({ ok: true });
}
