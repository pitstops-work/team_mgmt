import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ThreadsList from "./ThreadsList";

export default async function ThreadsPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const [threads, goals, users] = await Promise.all([
    prisma.thread.findMany({
      where: {
        deletedAt: null,
        OR: [
          { pitstop: { deletedAt: null, goal: { deletedAt: null } } },
          { goalId: { not: null } },
          { eventId: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        pitstopId: true,
        goalId: true,
        eventId: true,
        pitstop: {
          select: {
            id: true, title: true,
            goal: { select: { id: true, title: true } },
            owner: { select: { id: true, name: true, image: true } },
          },
        },
        goal: {
          select: {
            id: true, title: true,
            owner: { select: { id: true, name: true, image: true } },
          },
        },
        event: {
          select: { id: true, title: true, scheduledAt: true },
        },
        _count: { select: { messages: { where: { deletedAt: null } } } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true, author: { select: { name: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.goal.findMany({ where: { deletedAt: null }, select: { id: true, title: true }, orderBy: { title: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, image: true } }),
  ]);

  const langRows = await prisma.$queryRaw<{ preferredLang: string }[]>`
    SELECT "preferredLang" FROM "User" WHERE id = ${userId} LIMIT 1
  `;
  const preferredLang = langRows[0]?.preferredLang ?? "en";

  return (
    <ThreadsList
      threads={JSON.parse(JSON.stringify(threads))}
      goals={JSON.parse(JSON.stringify(goals))}
      users={JSON.parse(JSON.stringify(users))}
      currentUserId={userId}
      currentUserName={session!.user!.name ?? session!.user!.email ?? ""}
      preferredLang={preferredLang}
    />
  );
}
