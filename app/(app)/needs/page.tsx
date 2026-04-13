import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import NeedsDashboard from "./NeedsDashboard";

export default async function NeedsPage() {
  const session = await auth();

  const cities = await prisma.city.findMany({
    where: { deletedAt: null },
    include: {
      zones: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        include: {
          clusters: {
            where: { deletedAt: null },
            orderBy: { name: "asc" },
            include: {
              settlements: {
                where: { deletedAt: null },
                orderBy: { name: "asc" },
                include: {
                  assessments: {
                    orderBy: { assessedAt: "desc" },
                    take: 1,
                    select: { id: true, assessmentYear: true, assessedAt: true, totalHouseholds: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <NeedsDashboard
      cities={JSON.parse(JSON.stringify(cities))}
      currentUserId={session!.user!.id!}
    />
  );
}
