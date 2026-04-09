import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ThreadsList from "./ThreadsList";

export default async function ThreadsPage() {
  await auth();

  const [threads, goals] = await Promise.all([
    prisma.thread.findMany({
      where: { deletedAt: null, pitstop: { deletedAt: null, goal: { deletedAt: null } } },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        pitstop: {
          select: {
            id: true, title: true,
            goal: { select: { id: true, title: true } },
            owner: { select: { id: true, name: true, image: true } },
          },
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
  ]);

  return (
    <ThreadsList
      threads={JSON.parse(JSON.stringify(threads))}
      goals={JSON.parse(JSON.stringify(goals))}
    />
  );
}
