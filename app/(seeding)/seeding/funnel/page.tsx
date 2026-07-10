import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess, canEditFunnelGeo } from "@/lib/seeding/access";
import { computeTargets } from "@/lib/seeding/funnel";
import FunnelEditor from "./FunnelEditor";

export default async function FunnelPage() {
  const session = await auth();
  const access = await getSeedingAccess(session);

  const [config, geos] = await Promise.all([
    prisma.seedingFunnelConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingGeo.findMany({ orderBy: { sortOrder: "asc" }, include: { funnel: true } }),
  ]);
  if (!config) return <div className="text-sm text-stone-400">Funnel not initialised.</div>;

  const targets = computeTargets(config, geos.length);

  return (
    <FunnelEditor
      config={config}
      targets={targets}
      canEditConfig={access.isCentral}
      geos={geos.map((g) => ({
        id: g.id, label: g.label,
        reachToDate: g.funnel?.reachToDate ?? 0, leadsToDate: g.funnel?.leadsToDate ?? 0,
        appsReceived: g.funnel?.appsReceived ?? 0, screened: g.funnel?.screened ?? 0, shortlisted: g.funnel?.shortlisted ?? 0,
        editable: canEditFunnelGeo(access, g.id),
      }))}
    />
  );
}
