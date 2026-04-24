import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SessionProvider from "@/components/SessionProvider";
import QueryProvider from "@/components/QueryProvider";
import AppNav from "./AppNav";
import PushSubscriber from "@/components/PushSubscriber";
import { PWAInstallBanner } from "@/components/PWAInstallButton";
import NavigationProgress from "@/components/NavigationProgress";
import ActivityPing from "@/components/ActivityPing";
import SearchShortcut from "@/components/SearchShortcut";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import AgentPanel from "@/components/AgentPanel";
import prisma from "@/lib/prisma";
import { isAdminUser, isSuperAdmin } from "@/lib/roleGuard";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [unreadCount, me] = await Promise.all([
    prisma.notification.count({ where: { userId: session.user.id!, read: false } }),
    prisma.user.findUnique({ where: { id: session.user.id! }, select: { designation: true } }),
  ]);

  return (
    <SessionProvider>
      <QueryProvider>
      <NavigationProgress />
      <ActivityPing />
      <PushSubscriber />
      <SearchShortcut />
      <KeyboardShortcuts />
      <div className="flex h-screen overflow-hidden">
        <AppNav user={session.user} unreadCount={unreadCount} isAdmin={isAdminUser(session)} isViewer={session.user.role === "viewer"} designation={me?.designation ?? "Other"} />
        <main className="relative flex-1 overflow-y-auto pb-16 sm:pb-0">{children}</main>
        <PWAInstallBanner />
        {isSuperAdmin(session) && <AgentPanel />}
      </div>
      </QueryProvider>
    </SessionProvider>
  );
}
