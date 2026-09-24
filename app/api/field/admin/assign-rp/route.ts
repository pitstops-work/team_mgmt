// Set an RP's /field scope: which clusters they cover, and optionally which
// domains they actually run within them.
//   POST { userId, clusterIds: string[], domains?: string[] }
// An empty `domains` means unrestricted — every domain in their clusters.
import { NextRequest } from "next/server";
import { logField } from "@/lib/field/audit";
import prisma from "@/lib/prisma";
import { requireFieldAdmin } from "@/lib/field/access";

export async function POST(req: NextRequest) {
  const actorId = await requireFieldAdmin();
  if (!actorId) return Response.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const userId = String(b?.userId ?? "");
  const clusterIds: string[] = Array.isArray(b?.clusterIds) ? b.clusterIds : [];
  const domains: string[] | null = Array.isArray(b?.domains) ? b.domains : null;
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });
  // `set:` is a full replace, so record what it replaced — otherwise a
  // mis-click that empties someone's clusters leaves no trace of the old list.
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { rpClusters: { select: { id: true } }, rpFieldDomains: { select: { domain: true } } },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      rpClusters: { set: clusterIds.map((id) => ({ id })) },
      ...(domains ? { rpFieldDomains: { set: domains.map((domain) => ({ domain })) } } : {}),
    },
  });
  logField("User", userId, actorId, "field_clusters_assigned", {
    field: "rpClusters",
    from: (before?.rpClusters ?? []).map((c) => c.id),
    to: clusterIds,
  });
  if (domains) {
    logField("User", userId, actorId, "field_domains_assigned", {
      field: "rpFieldDomains",
      from: (before?.rpFieldDomains ?? []).map((d) => d.domain),
      to: domains,
    });
  }
  return Response.json({ ok: true });
}
