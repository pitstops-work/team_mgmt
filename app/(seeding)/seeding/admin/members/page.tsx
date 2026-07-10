import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSeedingAccess } from "@/lib/seeding/access";
import { SEEDING_ROLES } from "@/lib/seeding/roles";
import MembersClient from "./MembersClient";

export default async function MembersAdminPage() {
  const session = await auth();
  const access = await getSeedingAccess(session);
  if (!access.canManageStructure) redirect("/seeding");

  const [members, users, geos] = await Promise.all([
    prisma.seedingMember.findMany({
      include: { user: { select: { name: true, email: true } }, geo: { select: { label: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.seedingGeo.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
  ]);

  return (
    <MembersClient
      members={members.map((m) => ({ id: m.id, role: m.role, userName: m.user.name ?? m.user.email, geoLabel: m.geo?.label ?? null }))}
      users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
      geos={geos}
      roles={SEEDING_ROLES.map((r) => ({ key: r.key, label: r.label, scope: r.scope }))}
    />
  );
}
