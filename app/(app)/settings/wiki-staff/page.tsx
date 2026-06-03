import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import WikiStaffView from "./WikiStaffView";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function WikiStaffPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const isAdmin = session.user.role === "admin" || session.user.role === "super-admin";
  if (!isAdmin) redirect("/settings");

  const [staff, users] = await Promise.all([
    prisma.wikiStaff.findMany({
      orderBy: [{ wikiRole: "asc" }, { createdAt: "asc" }],
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    }),
    // Active users with an email — small enough for a one-shot dropdown.
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  return (
    <SurfaceProvider id="settings.wiki_staff">
      <WikiStaffView
        staff={JSON.parse(JSON.stringify(staff))}
        users={users}
      />
    </SurfaceProvider>
  );
}
