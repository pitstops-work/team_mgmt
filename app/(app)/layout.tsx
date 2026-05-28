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
import BfcacheRefresh from "@/components/BfcacheRefresh";
import prisma from "@/lib/prisma";
import { isAdminUser, isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { buildRbacContext } from "@/lib/rbac";
import { computeAllowedNavHrefs } from "./navGates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (isBudgetAdmin(session)) {
    return (
      <SessionProvider>
        <QueryProvider>
          <main className="min-h-screen bg-stone-50">{children}</main>
        </QueryProvider>
      </SessionProvider>
    );
  }

  const [unreadCount, me, ctx, directReportsCount] = await Promise.all([
    prisma.notification.count({ where: { userId: session.user.id!, read: false } }),
    prisma.user.findUnique({ where: { id: session.user.id! }, select: { designation: true } }),
    buildRbacContext(session),
    prisma.user.count({ where: { reportsToId: session.user.id! } }),
  ]);

  const isAdmin = isAdminUser(session);
  const allowedNavHrefs = await computeAllowedNavHrefs(ctx, {
    hasReports: directReportsCount > 0,
    isAdmin,
  });

  return (
    <SessionProvider>
      <QueryProvider>
      <BfcacheRefresh />
      <NavigationProgress />
      <ActivityPing />
      <PushSubscriber />
      <SearchShortcut />
      <KeyboardShortcuts />
      <div className="flex h-screen overflow-hidden">
        <AppNav
          user={session.user}
          unreadCount={unreadCount}
          isAdmin={isAdmin}
          isViewer={session.user.role === "viewer"}
          designation={me?.designation ?? "Other"}
          allowedNavHrefs={Array.from(allowedNavHrefs)}
        />
        <main className="relative flex-1 overflow-y-auto pb-16 sm:pb-0">{children}</main>
        <PWAInstallBanner />
        {isSuperAdmin(session) && <AgentPanel />}
      </div>
      </QueryProvider>
    </SessionProvider>
  );
}
