import { prisma } from "@/lib/prisma";
import PartnersPage from "./PartnersPage";

export default async function Page() {
  const [dbPartners, customPolygons] = await Promise.all([
    prisma.mapPartner.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.mapPolygon.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, partnerKey: true, zone: true, cluster: true, description: true },
    }),
  ]);

  return (
    <PartnersPage
      dbPartners={dbPartners}
      customPolygons={customPolygons}
    />
  );
}
