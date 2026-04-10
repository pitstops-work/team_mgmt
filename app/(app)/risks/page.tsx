import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import RisksView from "./RisksView";

export default async function RisksPage() {
  const session = await auth();

  const [risks, goals] = await Promise.all([
    prisma.risk.findMany({
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
    <RisksView
      initialRisks={JSON.parse(JSON.stringify(risks))}
      goals={JSON.parse(JSON.stringify(goals))}
      currentUserId={session!.user!.id!}
    />
  );
}
