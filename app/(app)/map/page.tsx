import { Suspense } from "react";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import MapDashboard from "@/components/map/MapDashboard";

export const metadata = { title: "Programme Map · Urban Program" };

export default async function MapPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const me = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { designation: true, role: true } })
    : null;

  // designation is read via raw SQL to bypass Prisma cache
  let designation = "Other";
  if (userId) {
    const rows = await prisma.$queryRaw<{ designation: string }[]>`
      SELECT designation FROM "User" WHERE id = ${userId} LIMIT 1
    `;
    designation = rows[0]?.designation ?? "Other";
  }

  return (
    <div className="absolute inset-0">
      <Suspense>
        <MapDashboard
          currentUserId={userId ?? undefined}
          currentUserDesignation={designation}
          currentUserRole={me?.role ?? session?.user?.role ?? "member"}
        />
      </Suspense>
    </div>
  );
}
