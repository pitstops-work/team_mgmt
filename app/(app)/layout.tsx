import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SessionProvider from "@/components/SessionProvider";
import AppNav from "./AppNav";
import prisma from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id!, read: false },
  });

  return (
    <SessionProvider>
      <div className="flex h-screen overflow-hidden">
        <AppNav user={session.user} unreadCount={unreadCount} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </SessionProvider>
  );
}
