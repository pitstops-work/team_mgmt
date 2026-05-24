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
      select: { emailOptIn: true, email: true },
    }),
    prisma.pushSubscription.count({ where: { userId } }),
  ]);

  return (
    <NotificationsView
      initial={{
        emailOptIn: user?.emailOptIn ?? false,
        email: user?.email ?? null,
        pushSubscribed: pushSubs > 0,
      }}
    />
  );
}
