// Create a new /field domain (an empty FieldDomainConfig — author its steps after).
//   POST { domain, label, unit?, cadenceCount?, cadencePeriod?, overallSlaDays?, hasLivePhase? }
// `domain` should match a needsDomain (NeedsFormulaConfig.domain) so interventions link.
import { NextRequest } from "next/server";
import { logField } from "@/lib/field/audit";
import prisma from "@/lib/prisma";
import { requireFieldAdmin } from "@/lib/field/access";

export async function POST(req: NextRequest) {
  const actorId = await requireFieldAdmin();
  if (!actorId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const domain = String(b?.domain ?? "").trim();
  const label = String(b?.label ?? "").trim() || domain;
  if (!domain) return Response.json({ error: "domain required" }, { status: 400 });
  if (await prisma.fieldDomainConfig.findUnique({ where: { domain } })) {
    return Response.json({ error: "domain already configured" }, { status: 409 });
  }
  const max = await prisma.fieldDomainConfig.aggregate({ _max: { sortOrder: true } });
  await prisma.fieldDomainConfig.create({
    data: {
      domain,
      label,
      unit: b?.unit === "cluster" ? "cluster" : "settlement",
      cadenceCount: Number.isFinite(b?.cadenceCount) ? b.cadenceCount : null,
      cadencePeriod: b?.cadencePeriod === "week" || b?.cadencePeriod === "month" ? b.cadencePeriod : null,
      overallSlaDays: Number.isFinite(b?.overallSlaDays) ? b.overallSlaDays : null,
      hasLivePhase: b?.hasLivePhase !== false,
      sortOrder: (max._max.sortOrder ?? 0) + 10,
    },
  });
  logField("FieldDomain", domain, actorId, "created", { field: "label", to: label });
  return Response.json({ ok: true, domain });
}
