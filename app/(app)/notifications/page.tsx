import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import NotificationsPage from "./NotificationsPage";

export default async function NotificationsRoute() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId, read: false },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return <NotificationsPage initialNotifications={JSON.parse(JSON.stringify(notifications))} />;
}
