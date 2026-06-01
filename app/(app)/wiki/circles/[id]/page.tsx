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

  const [circle, needsDomains] = await Promise.all([
    prisma.wikiPracticeCircle.findUnique({
      where: { id },
      include: {
        facilitator: { select: { id: true, name: true, image: true } },
        zone: { select: { id: true, name: true } },
        attendees: { select: { id: true, name: true, image: true } },
        linkedPages: { select: { id: true, slug: true, title: true, status: true } },
      },
    }),
    prisma.needsFormulaConfig.findMany({ select: { domain: true, label: true } }),
  ]);
  if (!circle || circle.archivedAt) notFound();

  const steward = await isWikiSteward(userId);
  const canModify = circle.facilitatorId === userId || steward;
  const verticalLabel =
    circle.vertical
      ? (needsDomains.find((d) => d.domain === circle.vertical)?.label ?? circle.vertical)
      : null;

  return (
    <CircleDetailView
      circle={JSON.parse(JSON.stringify(circle))}
      canModify={canModify}
      verticalLabel={verticalLabel}
    />
  );
}
