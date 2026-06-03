import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ThemesView from "./ThemesView";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function ThemesPage() {
  const session = await auth();

  const themes = await prisma.theme.findMany({
    where: { deletedAt: null },
    include: {
      _count: { select: { goals: true } },
      goals: {
        include: {
          goal: {
            select: { id: true, title: true, status: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <SurfaceProvider id="themes.view">
      <ThemesView
        initialThemes={JSON.parse(JSON.stringify(themes))}
        currentUserId={session!.user!.id!}
      />
    </SurfaceProvider>
  );
}
