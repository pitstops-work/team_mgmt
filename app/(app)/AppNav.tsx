"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { Target, Search, LogOut, Bell, Settings, Users, GanttChartSquare, CalendarClock, MoreHorizontal, X, Layers, BookOpen, ClipboardList, Tag, MapPin, CalendarRange, ClipboardCheck, HelpCircle, BarChart3, ShieldCheck, FileText, Timer, MessageSquare } from "lucide-react";
import Avatar from "@/components/Avatar";
import PWAInstallButton from "@/components/PWAInstallButton";

interface User {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export default function AppNav({ user, unreadCount, isAdmin, isViewer, designation }: { user: User; unreadCount: number; isAdmin?: boolean; isViewer?: boolean; designation?: string }) {
  const isRP = designation === "RP";
  const isZL = designation === "ZL";
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden sm:flex w-56 flex-shrink-0 border-r border-stone-200 bg-white flex-col h-full">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-stone-100">
          <Link href="/home" className="flex items-center gap-2" aria-label="Home">
            <div className="w-7 h-7 rounded-lg bg-sky-500 flex items-center justify-center">
              <Target className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-stone-900 text-sm tracking-tight">Pitstop</span>
          </Link>
        </div>

        {/* Search trigger */}
        <div className="px-3 py-3 border-b border-stone-100">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("pitstop:search-open"))}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-stone-50 border border-stone-200 hover:border-stone-300 hover:bg-stone-100 transition-all text-left"
          >
            <Search className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
            <span className="flex-1 text-xs text-stone-400">Search…</span>
            <kbd className="text-[10px] text-stone-400 border border-stone-200 rounded px-1 py-0.5 bg-white font-sans">⌘K</kbd>
          </button>
        </div>

        {/* Nav links */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-0.5">

          {/* Core */}
          <NavLink href="/home" active={pathname === "/home"}>
            <CalendarClock className="w-3.5 h-3.5 text-stone-500" />
            Home
          </NavLink>
          <NavLink href="/activities" active={pathname === "/activities"}>
            <CalendarClock className="w-3.5 h-3.5 text-stone-500" />
            Activities
          </NavLink>
          <NavLink href="/dashboard" active={pathname === "/dashboard"}>
            <Target className="w-3.5 h-3.5 text-stone-500" />
            Goals
          </NavLink>
          {!isRP && (
            <NavLink href="/needs" active={pathname.startsWith("/needs")}>
              <BarChart3 className="w-3.5 h-3.5 text-stone-500" />
              Field Coverage
            </NavLink>
          )}
          <NavLink href="/map" active={pathname === "/map" || pathname.startsWith("/settlements")}>
            <MapPin className="w-3.5 h-3.5 text-indigo-500" />
            Programme Map
          </NavLink>

          <div className="h-px bg-stone-100 my-2" />

          {/* Planning */}
          <NavLink href="/gantt" active={pathname === "/gantt"}>
            <GanttChartSquare className="w-3.5 h-3.5 text-stone-500" />
            Gantt
          </NavLink>
          <NavLink href="/planner" active={pathname === "/planner"}>
            <BookOpen className="w-3.5 h-3.5 text-stone-500" />
            Planner
          </NavLink>
          <NavLink href="/quarters" active={pathname.startsWith("/quarters")}>
            <CalendarRange className="w-3.5 h-3.5 text-stone-500" />
            Quarters
          </NavLink>
          {!isRP && !isZL && (
            <NavLink href="/programs" active={pathname.startsWith("/programs")}>
              <Layers className="w-3.5 h-3.5 text-stone-500" />
              Programs
            </NavLink>
          )}

          <div className="h-px bg-stone-100 my-2" />

          {/* People & work */}
          {!isRP && (
            <NavLink href="/people" active={pathname === "/people"}>
              <Users className="w-3.5 h-3.5 text-stone-500" />
              People
            </NavLink>
          )}
          {!isRP && !isZL && (
            <NavLink href="/review" active={pathname === "/review"}>
              <ClipboardCheck className="w-3.5 h-3.5 text-stone-500" />
              Review
            </NavLink>
          )}
          {!isRP && !isZL && (
            <NavLink href="/report" active={pathname === "/report"}>
              <FileText className="w-3.5 h-3.5 text-stone-500" />
              Report
            </NavLink>
          )}
          {isAdmin && (
            <NavLink href="/sla" active={pathname === "/sla"}>
              <Timer className="w-3.5 h-3.5 text-stone-500" />
              SLA
            </NavLink>
          )}
          <NavLink href="/standup" active={pathname === "/standup"}>
            <ClipboardList className="w-3.5 h-3.5 text-stone-500" />
            Field Notes
          </NavLink>
          <NavLink href="/threads" active={pathname === "/threads"}>
            <MessageSquare className="w-3.5 h-3.5 text-stone-500" />
            Threads
          </NavLink>
          {!isRP && !isZL && (
            <NavLink href="/themes" active={pathname.startsWith("/themes")}>
              <Tag className="w-3.5 h-3.5 text-stone-500" />
              Themes
            </NavLink>
          )}

          <div className="h-px bg-stone-100 my-2" />

          {/* Account */}
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
          {!isViewer && (
            <NavLink href="/settings" active={pathname === "/settings"}>
              <Settings className="w-3.5 h-3.5 text-stone-500" />
              Settings
            </NavLink>
          )}
          {isViewer && (
            <NavLink href="/settings/language" active={pathname === "/settings/language"}>
              <Settings className="w-3.5 h-3.5 text-stone-500" />
              Settings
            </NavLink>
          )}
          {isAdmin && (
            <NavLink href="/settings/users" active={pathname === "/settings/users"}>
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
              Users
            </NavLink>
          )}
          {isAdmin && (
            <NavLink href="/readiness" active={pathname === "/readiness"}>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Readiness
            </NavLink>
          )}
          <NavLink href="/help" active={pathname === "/help"}>
            <HelpCircle className="w-3.5 h-3.5 text-stone-500" />
            Manual
          </NavLink>
        </div>

        {/* User */}
        <div className="px-3 py-3 border-t border-stone-100">
          <PWAInstallButton />
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-stone-50 group">
            <Avatar name={user.name} image={user.image} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-stone-700 truncate">{user.name ?? user.email}</p>
              {isViewer && (
                <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">View only</span>
              )}
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
        <Link href="/home" className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${pathname === "/home" ? "text-sky-600" : "text-stone-400"}`}>
          <CalendarClock className="w-5 h-5" />
          Home
        </Link>
        <Link href="/activities" className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${pathname === "/activities" ? "text-sky-600" : "text-stone-400"}`}>
          <CalendarClock className="w-5 h-5" />
          Activities
        </Link>
        <Link href="/dashboard" className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${pathname === "/dashboard" ? "text-sky-600" : "text-stone-400"}`}>
          <Target className="w-5 h-5" />
          Goals
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
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-2 border-b border-stone-100">
              <p className="text-sm font-semibold text-stone-800">Menu</p>
              <button onClick={() => setShowMore(false)} className="p-1 text-stone-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto px-3 py-2 pb-8 space-y-0.5">
              {/* Core */}
              {([
                { href: "/home",       icon: <CalendarClock className="w-5 h-5" />, label: "Home",           show: true },
                { href: "/activities", icon: <CalendarClock className="w-5 h-5" />, label: "Activities",      show: true },
                { href: "/dashboard",  icon: <Target className="w-5 h-5" />,        label: "Goals",           show: true },
                { href: "/needs",      icon: <BarChart3 className="w-5 h-5" />,     label: "Field Coverage",  show: !isRP },
                { href: "/map",        icon: <MapPin className="w-5 h-5" />,        label: "Programme Map",   show: true },
              ] as { href: string; icon: React.ReactNode; label: string; show: boolean }[])
                .filter(i => i.show)
                .map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setShowMore(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${pathname.startsWith(item.href) ? "bg-sky-50 text-sky-700" : "text-stone-700 hover:bg-stone-50"}`}>
                    <span className="text-stone-400">{item.icon}</span>
                    {item.label}
                  </Link>
                ))
              }

              <div className="h-px bg-stone-100 my-2" />

              {/* Planning */}
              {([
                { href: "/gantt",    icon: <GanttChartSquare className="w-5 h-5" />, label: "Gantt Chart", show: true },
                { href: "/planner",  icon: <BookOpen className="w-5 h-5" />,         label: "Planner",     show: true },
                { href: "/quarters", icon: <CalendarRange className="w-5 h-5" />,    label: "Quarters",    show: true },
                { href: "/programs", icon: <Layers className="w-5 h-5" />,           label: "Programs",    show: !isRP && !isZL },
              ] as { href: string; icon: React.ReactNode; label: string; show: boolean }[])
                .filter(i => i.show)
                .map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setShowMore(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${pathname.startsWith(item.href) ? "bg-sky-50 text-sky-700" : "text-stone-700 hover:bg-stone-50"}`}>
                    <span className="text-stone-400">{item.icon}</span>
                    {item.label}
                  </Link>
                ))
              }

              <div className="h-px bg-stone-100 my-2" />

              {/* People & work */}
              {([
                { href: "/people",  icon: <Users className="w-5 h-5" />,           label: "People",       show: !isRP },
                { href: "/review",  icon: <ClipboardCheck className="w-5 h-5" />, label: "Review",      show: !isRP && !isZL },
                { href: "/report",  icon: <FileText className="w-5 h-5" />,        label: "Report",       show: !isRP && !isZL },
                { href: "/sla",     icon: <Timer className="w-5 h-5" />,           label: "SLA",          show: isAdmin },
                { href: "/standup", icon: <ClipboardList className="w-5 h-5" />,    label: "Field Notes",  show: true },
                { href: "/threads", icon: <MessageSquare className="w-5 h-5" />,   label: "Threads",      show: true },
                { href: "/themes",  icon: <Tag className="w-5 h-5" />,             label: "Themes",       show: !isRP && !isZL },
              ] as { href: string; icon: React.ReactNode; label: string; show: boolean }[])
                .filter(i => i.show)
                .map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setShowMore(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${pathname.startsWith(item.href) ? "bg-sky-50 text-sky-700" : "text-stone-700 hover:bg-stone-50"}`}>
                    <span className="text-stone-400">{item.icon}</span>
                    {item.label}
                  </Link>
                ))
              }

              <div className="h-px bg-stone-100 my-2" />

              {/* Account */}
              {([
                { href: isViewer ? "/settings/language" : "/settings", icon: <Settings className="w-5 h-5" />, label: "Settings" },
                ...(isAdmin ? [{ href: "/settings/users", icon: <ShieldCheck className="w-5 h-5 text-indigo-500" />, label: "Users" }] : []),
                ...(isAdmin ? [{ href: "/readiness", icon: <ShieldCheck className="w-5 h-5" />, label: "Team Readiness" }] : []),
                { href: "/help", icon: <HelpCircle className="w-5 h-5" />, label: "Manual" },
              ] as { href: string; icon: React.ReactNode; label: string }[]).map(item => (
                <Link key={item.href} href={item.href} onClick={() => setShowMore(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${pathname === item.href ? "bg-sky-50 text-sky-700" : "text-stone-700 hover:bg-stone-50"}`}>
                  <span className="text-stone-400">{item.icon}</span>
                  {item.label}
                </Link>
              ))}

              <div className="px-1 mt-2">
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
