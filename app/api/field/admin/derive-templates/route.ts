// Derive a domain's step templates from the legacy control-plane config.
//   POST { domain, setupSlug, liveSlug?, catalogSlug?, scoredIndicatorKey?, prune?, dryRun? }
// dryRun returns the plan for preview; otherwise it is applied and counts returned.
import { NextRequest } from "next/server";
import { requireFieldAdmin } from "@/lib/field/access";
import { buildTemplatePlan, applyTemplatePlan } from "@/lib/field/derive";
import { logDomainBulkOp } from "@/lib/field/audit";
import { loadDerivableTemplates } from "@/lib/field/adminData";

/** What this domain can be derived from. Fetched when the modal opens, so the
 *  console's main load stays a fixed number of queries. */
export async function GET(req: NextRequest) {
  if (!(await requireFieldAdmin())) return Response.json({ error: "Forbidden" }, { status: 403 });
  const domain = new URL(req.url).searchParams.get("domain");
  if (!domain) return Response.json({ error: "domain required" }, { status: 400 });
  return Response.json(await loadDerivableTemplates(domain));
}

export async function POST(req: NextRequest) {
  const actorId = await requireFieldAdmin();
  if (!actorId) return Response.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const domain = String(b?.domain ?? "").trim();
  const setupSlug = String(b?.setupSlug ?? "").trim();
  if (!domain || !setupSlug) return Response.json({ error: "domain + setupSlug required" }, { status: 400 });

  let plan;
  try {
    plan = await buildTemplatePlan({
      domain,
      setupSlug,
      liveSlug: b?.liveSlug || null,
      catalogSlug: b?.catalogSlug || null,
      scoredIndicatorKey: b?.scoredIndicatorKey || null,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not read the legacy template" }, { status: 400 });
  }

  if (b?.dryRun) return Response.json({ ok: true, plan });

  const res = await applyTemplatePlan(plan, { prune: !!b?.prune });
  // One row for the domain — a derive rewrites the whole recipe at once.
  logDomainBulkOp(domain, actorId, "derive_templates", {
    setupSlug, liveSlug: b?.liveSlug || null, catalogSlug: b?.catalogSlug || null,
    setup: res.setupUpserted, visit: res.visitUpserted,
    deactivated: res.setupDeactivated + res.visitDeactivated,
    deleted: res.setupDeleted + res.visitDeleted,
  });
  return Response.json({ ok: true, plan, result: res });
}
