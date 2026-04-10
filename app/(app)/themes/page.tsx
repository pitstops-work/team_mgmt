import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ThemesView from "./ThemesView";

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
    <ThemesView
      initialThemes={JSON.parse(JSON.stringify(themes))}
      currentUserId={session!.user!.id!}
    />
  );
}
