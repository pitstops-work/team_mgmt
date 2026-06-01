import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isWikiSteward } from "@/lib/wiki/auth";
import { notFound, redirect } from "next/navigation";
import PartnerReviewDetailView from "./PartnerReviewDetailView";

export default async function PartnerReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const meeting = await prisma.wikiPartnerReviewMeeting.findUnique({
    where: { id },
    include: {
      partnerOrg: { select: { id: true, name: true } },
      attendees: { select: { id: true, name: true, image: true } },
      linkedPages: { select: { id: true, slug: true, title: true, status: true } },
    },
  });
  if (!meeting || meeting.archivedAt) notFound();

  const steward = await isWikiSteward(userId);
  // Archive permission matches the API: any attendee OR steward.
  const canArchive = steward || meeting.attendees.some((a) => a.id === userId);

  return (
    <PartnerReviewDetailView
      meeting={JSON.parse(JSON.stringify(meeting))}
      canModify={steward}
      canArchive={canArchive}
    />
  );
}
