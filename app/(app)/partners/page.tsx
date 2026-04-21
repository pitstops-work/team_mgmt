import { prisma } from "@/lib/prisma";
import { LAYERS } from "@/lib/layers";
import PartnersPage from "./PartnersPage";

const BUILT_IN_PARTNER_LAYERS = LAYERS.filter(
  l => l.type === "polygon" && l.key !== "custom_settlements" && l.file !== ""
);

export default async function Page() {
  // Ensure all built-in partners exist in DB (idempotent — skips existing rows)
  await prisma.mapPartner.createMany({
    data: BUILT_IN_PARTNER_LAYERS.map(l => ({
      key: l.key,
      label: l.label,
      color: l.color,
      isBuiltIn: true,
    })),
    skipDuplicates: true,
  });

  const dbPartners = await prisma.mapPartner.findMany({
    orderBy: [{ isBuiltIn: "desc" }, { label: "asc" }],
  });

  return (
    <PartnersPage
      dbPartners={dbPartners}
      customPolygons={[]}
    />
  );
}
