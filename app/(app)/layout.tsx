import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SessionProvider from "@/components/SessionProvider";
import QueryProvider from "@/components/QueryProvider";
import AppNav from "./AppNav";
import PushSubscriber from "@/components/PushSubscriber";
import NavigationProgress from "@/components/NavigationProgress";
import prisma from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id!, read: false },
  });

  return (
    <SessionProvider>
      <QueryProvider>
      <NavigationProgress />
      <PushSubscriber />
      <div className="flex h-screen overflow-hidden">
        <AppNav user={session.user} unreadCount={unreadCount} isAdmin={session.user.email === process.env.ADMIN_EMAIL} />
        <main className="relative flex-1 overflow-y-auto pb-16 sm:pb-0">{children}</main>
      </div>
      </QueryProvider>
    </SessionProvider>
  );
}
