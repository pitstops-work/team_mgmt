"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { Target, Search, LogOut, Bell, Settings, Users, GanttChartSquare, CalendarDays, CalendarClock, MoreHorizontal, X, Sparkles, Layers, ListTodo, MessageSquare, BookOpen } from "lucide-react";
import Avatar from "@/components/Avatar";
import PWAInstallButton from "@/components/PWAInstallButton";

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
  const [showMore, setShowMore] = useState(false);

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
          <NavLink href="/timeline" active={pathname === "/timeline"}>
            <CalendarDays className="w-3.5 h-3.5 text-stone-500" />
            Timeline
          </NavLink>
          <NavLink href="/activities" active={pathname === "/activities"}>
            <CalendarClock className="w-3.5 h-3.5 text-stone-500" />
            Activities
          </NavLink>
          <NavLink href="/planner" active={pathname === "/planner"}>
            <BookOpen className="w-3.5 h-3.5 text-stone-500" />
            Planner
          </NavLink>
          <NavLink href="/programs" active={pathname.startsWith("/programs")}>
            <Layers className="w-3.5 h-3.5 text-stone-500" />
            Programs
          </NavLink>
          <NavLink href="/pitstops" active={pathname === "/pitstops"}>
            <ListTodo className="w-3.5 h-3.5 text-stone-500" />
            All Pitstops
          </NavLink>
          <NavLink href="/threads" active={pathname === "/threads"}>
            <MessageSquare className="w-3.5 h-3.5 text-stone-500" />
            All Threads
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
          <PWAInstallButton />
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

      {/* Mobile bottom nav — 5 items */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-200 flex items-stretch h-16">
        <Link href="/dashboard" className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${pathname === "/dashboard" ? "text-sky-600" : "text-stone-400"}`}>
          <span className="text-lg leading-none">◈</span>
          Goals
        </Link>
        <Link href="/timeline" className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${pathname === "/timeline" ? "text-sky-600" : "text-stone-400"}`}>
          <CalendarDays className="w-5 h-5" />
          Timeline
        </Link>
        <Link href="/activities" className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${pathname === "/activities" ? "text-sky-600" : "text-stone-400"}`}>
          <CalendarClock className="w-5 h-5" />
          Activities
        </Link>
        <Link href="/notifications" className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${pathname === "/notifications" ? "text-sky-600" : "text-stone-400"}`}>
          <div className="relative">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 flex items-center justify-center bg-sky-500 text-white text-[9px] font-bold rounded-full px-0.5">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          Alerts
        </Link>
        <button onClick={() => setShowMore(true)} className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${showMore ? "text-sky-600" : "text-stone-400"}`}>
          <MoreHorizontal className="w-5 h-5" />
          More
        </button>
      </nav>

      {/* More drawer */}
      {showMore && (
        <div className="sm:hidden fixed inset-0 z-[60]" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl pb-safe" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-stone-100">
              <p className="text-sm font-semibold text-stone-800">Menu</p>
              <button onClick={() => setShowMore(false)} className="p-1 text-stone-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-3 py-2 space-y-0.5 pb-8">
              {[
                { href: "/planner", icon: <BookOpen className="w-5 h-5" />, label: "Planner" },
                { href: "/people", icon: <Users className="w-5 h-5" />, label: "People" },
                { href: "/gantt", icon: <GanttChartSquare className="w-5 h-5" />, label: "Gantt Chart" },
                { href: "/programs", icon: <Layers className="w-5 h-5" />, label: "Programs" },
                { href: "/pitstops", icon: <ListTodo className="w-5 h-5" />, label: "All Pitstops" },
                { href: "/threads", icon: <MessageSquare className="w-5 h-5" />, label: "All Threads" },
                { href: "/settings", icon: <Settings className="w-5 h-5" />, label: "Settings" },
              ].map(item => (
                <Link key={item.href} href={item.href} onClick={() => setShowMore(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${pathname === item.href ? "bg-sky-50 text-sky-700" : "text-stone-700 hover:bg-stone-50"}`}>
                  <span className="text-stone-400">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
              <div className="h-px bg-stone-100 my-1 mx-4" />
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-stone-500">
                <Sparkles className="w-5 h-5 text-sky-400" />
                AI Assistant — tap ✦ button
              </div>
              <div className="px-1">
                <PWAInstallButton />
              </div>
              <button onClick={() => { setShowMore(false); signOut({ callbackUrl: "/login" }); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                <LogOut className="w-5 h-5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
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
