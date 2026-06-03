import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import ImpactDashboard from "./ImpactDashboard";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export const dynamic = "force-dynamic";

export default async function ImpactPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const cities = await prisma.city.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <SurfaceProvider id="effects.view">
      <Suspense>
        <ImpactDashboard cities={cities} />
      </Suspense>
    </SurfaceProvider>
  );
}
