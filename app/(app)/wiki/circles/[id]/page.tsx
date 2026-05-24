import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiSteward } from "@/lib/wiki/auth";
import { notFound, redirect } from "next/navigation";
import CircleDetailView from "./CircleDetailView";

export default async function CircleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const circle = await prisma.wikiPracticeCircle.findUnique({
    where: { id },
    include: {
      facilitator: { select: { id: true, name: true, image: true } },
      zone: { select: { id: true, name: true } },
      attendees: { select: { id: true, name: true, image: true } },
      linkedPages: { select: { id: true, slug: true, title: true, status: true } },
    },
  });
  if (!circle) notFound();

  const steward = await isWikiSteward(userId);
  const canModify = circle.facilitatorId === userId || steward;

  return (
    <CircleDetailView
      circle={JSON.parse(JSON.stringify(circle))}
      canModify={canModify}
    />
  );
}
