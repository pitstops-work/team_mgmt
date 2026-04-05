import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import NotificationsPage from "./NotificationsPage";

export default async function NotificationsRoute() {
  const session = await auth();

  const notifications = await prisma.notification.findMany({
    where: { userId: session!.user!.id! },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return <NotificationsPage initialNotifications={JSON.parse(JSON.stringify(notifications))} />;
}
