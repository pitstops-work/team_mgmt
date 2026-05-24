import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import NotificationsView from "./NotificationsView";

export default async function NotificationsSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [user, pushSubs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { whatsappOptIn: true, phone: true },
    }),
    prisma.pushSubscription.count({ where: { userId } }),
  ]);

  return (
    <NotificationsView
      initial={{
        whatsappOptIn: user?.whatsappOptIn ?? false,
        phone: user?.phone ?? null,
        pushSubscribed: pushSubs > 0,
      }}
    />
  );
}
