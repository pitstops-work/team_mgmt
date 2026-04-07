"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { Target, Search, LogOut, Bell, Settings, Users, GanttChartSquare } from "lucide-react";
import Avatar from "@/components/Avatar";

interface User {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export default function AppNav({ user, unreadCount }: { user: User; unreadCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/dashboard?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden sm:flex w-56 flex-shrink-0 border-r border-stone-200 bg-white flex-col h-full">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-stone-100">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-500 flex items-center justify-center">
              <Target className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-stone-900 text-sm tracking-tight">Pitstop</span>
          </Link>
        </div>

        {/* Search */}
        <div className="px-3 py-3 border-b border-stone-100">
          <form onSubmit={handleSearch}>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-stone-50 border border-stone-200 focus-within:border-sky-400 focus-within:ring-1 focus-within:ring-sky-400 transition-all">
              <Search className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-xs text-stone-700 placeholder:text-stone-400 outline-none"
              />
            </div>
          </form>
        </div>

        {/* Nav links */}
        <div className="flex-1 px-3 py-3 space-y-0.5">
          <NavLink href="/dashboard" active={pathname === "/dashboard"}>
            <span className="text-stone-500">◈</span>
            Goals
          </NavLink>
          <NavLink href="/people" active={pathname === "/people"}>
            <Users className="w-3.5 h-3.5 text-stone-500" />
            People
          </NavLink>
          <NavLink href="/gantt" active={pathname === "/gantt"}>
            <GanttChartSquare className="w-3.5 h-3.5 text-stone-500" />
            Gantt
          </NavLink>
          <NavLink href="/notifications" active={pathname === "/notifications"}>
            <div className="relative">
              <Bell className="w-3.5 h-3.5 text-stone-500" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 flex items-center justify-center bg-sky-500 text-white text-[9px] font-bold rounded-full px-0.5">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            Notifications
          </NavLink>
          <NavLink href="/settings" active={pathname === "/settings"}>
            <Settings className="w-3.5 h-3.5 text-stone-500" />
            Settings
          </NavLink>
        </div>

        {/* User */}
        <div className="px-3 py-3 border-t border-stone-100">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-stone-50 group">
            <Avatar name={user.name} image={user.image} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-stone-700 truncate">{user.name ?? user.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5 text-stone-400 hover:text-stone-600" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-200 flex items-stretch h-16">
        <Link
          href="/dashboard"
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
            pathname === "/dashboard" ? "text-sky-600" : "text-stone-400"
          }`}
        >
          <span className="text-lg leading-none">◈</span>
          Goals
        </Link>

        <Link
          href="/people"
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
            pathname === "/people" ? "text-sky-600" : "text-stone-400"
          }`}
        >
          <Users className="w-5 h-5" />
          People
        </Link>

        <Link
          href="/gantt"
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
            pathname === "/gantt" ? "text-sky-600" : "text-stone-400"
          }`}
        >
          <GanttChartSquare className="w-5 h-5" />
          Gantt
        </Link>

        <Link
          href="/notifications"
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
            pathname === "/notifications" ? "text-sky-600" : "text-stone-400"
          }`}
        >
          <div className="relative">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 flex items-center justify-center bg-sky-500 text-white text-[9px] font-bold rounded-full px-0.5">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          Notifications
        </Link>

        <Link
          href="/settings"
          className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
            pathname === "/settings" ? "text-sky-600" : "text-stone-400"
          }`}
        >
          <Settings className="w-5 h-5" />
          Settings
        </Link>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-stone-400"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign out</span>
        </button>
      </nav>
    </>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? "bg-sky-50 text-sky-700 font-medium"
          : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
      }`}
    >
      {children}
    </Link>
  );
}
