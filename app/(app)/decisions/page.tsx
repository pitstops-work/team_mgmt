import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import DecisionsView from "./DecisionsView";

export default async function DecisionsPage() {
  const session = await auth();

  const [decisions, goals] = await Promise.all([
    prisma.decision.findMany({
      where: { deletedAt: null },
      include: { createdBy: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.goal.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  return (
    <DecisionsView
      initialDecisions={JSON.parse(JSON.stringify(decisions))}
      goals={JSON.parse(JSON.stringify(goals))}
      currentUserId={session!.user!.id!}
    />
  );
}
