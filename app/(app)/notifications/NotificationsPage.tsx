"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const typeLabel: Record<string, string> = {
  Mention: "Mention",
  NewPitstop: "New Pitstop",
  GoalStatusChange: "Status Change",
  NewMessage: "New Message",
};

export default function NotificationsPage({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);

  const markRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-stone-500 mt-0.5">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-20">
          <Bell className="w-8 h-8 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-400 text-sm">No notifications yet.</p>
          <p className="text-stone-400 text-xs mt-1">Follow goals and subscribe to threads to get notified.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map((n) => {
            const content = (
              <div className={`flex items-start gap-3 px-4 py-3.5 rounded-lg border transition-colors ${
                n.read
                  ? "bg-white border-stone-100 text-stone-500"
                  : "bg-sky-50 border-sky-100 text-stone-800"
              }`}>
                <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${n.read ? "bg-transparent" : "bg-sky-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-stone-400">
                      {typeLabel[n.type] ?? n.type}
                    </span>
                    <span className="text-[10px] text-stone-400">
                      {new Date(n.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className={`text-sm font-medium ${n.read ? "text-stone-600" : "text-stone-900"}`}>{n.title}</p>
                  {n.body && <p className="text-xs text-stone-500 mt-0.5">{n.body}</p>}
                </div>
                {!n.read && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); markRead(n.id); }}
                    title="Mark as read"
                    className="flex-shrink-0 p-1 text-stone-400 hover:text-sky-600 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );

            return n.link ? (
              <Link key={n.id} href={n.link} onClick={() => !n.read && markRead(n.id)}>
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
