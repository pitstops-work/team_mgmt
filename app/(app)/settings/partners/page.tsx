import { prisma } from "@/lib/prisma";
import PartnersPage from "./PartnersPage";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

/**
 * Partners admin — now backed by Org rows where kind="partner". Built-ins
 * used to be auto-seeded here from `lib/layers.ts:LAYERS` via createMany;
 * after the Org migration (2026-06-04, `backfill-partner-orgs.ts`) every
 * partner is an admin-edited row and no source-code-driven seeding happens
 * on page load. The PartnersPage UI keeps its DBPartner shape unchanged —
 * we just project Org → that shape here.
 */
export default async function Page() {
  const orgs = await prisma.org.findMany({
    where: { kind: "partner", archivedAt: null },
    select: { id: true, name: true, slug: true, mapKey: true, color: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  const dbPartners = orgs.map((o) => ({
    id: o.id,
    key: o.mapKey ?? o.slug,
    label: o.name,
    color: o.color ?? "#6366f1",
    isBuiltIn: false,
    createdAt: o.createdAt,
  }));

  return (
    <SurfaceProvider id="partners.list">
      <PartnersPage
        dbPartners={dbPartners}
        customPolygons={[]}
      />
    </SurfaceProvider>
  );
}
