import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSeedingAccess } from "@/lib/seeding/access";
import SubGeosClient from "./SubGeosClient";

export default async function SubGeosAdminPage() {
  const session = await auth();
  const access = await getSeedingAccess(session);
  if (!access.canManageStructure) redirect("/seeding");

  const geos = await prisma.seedingGeo.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      subGeos: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { channels: true, sessions: true } } },
      },
    },
  });

  return (
    <SubGeosClient
      geos={geos.map((g) => ({
        id: g.id,
        label: g.label,
        subGeos: g.subGeos.map((s) => ({
          id: s.id,
          label: s.label,
          notes: s.notes,
          archived: s.archivedAt !== null,
          channelCount: s._count.channels,
          sessionCount: s._count.sessions,
        })),
      }))}
    />
  );
}
