import { prisma } from "@/lib/prisma";
import PartnersPage from "./PartnersPage";

export default async function Page() {
  const dbPartners = await prisma.mapPartner.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <PartnersPage
      dbPartners={dbPartners}
      customPolygons={[]}
    />
  );
}
