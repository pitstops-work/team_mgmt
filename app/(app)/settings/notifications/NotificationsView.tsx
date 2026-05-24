"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, MessageSquare, Mail, Save } from "lucide-react";

type Initial = {
  emailOptIn: boolean;
  email: string | null;
  pushSubscribed: boolean;
};

export default function NotificationsView({ initial }: { initial: Initial }) {
  const [emailOptIn, setEmailOptIn] = useState(initial.emailOptIn);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const dirty = emailOptIn !== initial.emailOptIn;

  async function save() {
    setSaving(true);
    const res = await fetch("/api/account/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailOptIn }),
    });
    setSaving(false);
    if (res.ok) setSavedAt(new Date());
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Settings
        </Link>

        <h1 className="text-2xl font-semibold text-stone-900 mb-2 inline-flex items-center gap-2">
          <Bell className="w-5 h-5 text-stone-600" />
          Notifications
        </h1>
        <p className="text-sm text-stone-600 mb-6">
          Where you want wiki digests, flag alerts, and review reminders to land.
        </p>

        <div className="space-y-4">
          {/* In-app — always on */}
          <section className="bg-white border border-stone-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-stone-800 inline-flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-stone-500" />
                  In-app notifications
                </h2>
                <p className="text-xs text-stone-500 mt-1">
                  Always on. Visible in the bell icon top-right.
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                On
              </span>
            </div>
          </section>

          {/* Web push */}
          <section className="bg-white border border-stone-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-stone-800 inline-flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-stone-500" />
                  Browser push
                </h2>
                <p className="text-xs text-stone-500 mt-1">
                  {initial.pushSubscribed
                    ? "Enabled in this browser. Disable from your browser's site settings if you want to stop."
                    : "Not enabled. Enable from Settings → Push Notifications."}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded border ${
                  initial.pushSubscribed
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-stone-50 text-stone-500 border-stone-200"
                }`}
              >
                {initial.pushSubscribed ? "On" : "Off"}
              </span>
            </div>
          </section>

          {/* Email */}
          <section className="bg-white border border-stone-200 rounded-lg p-4">
            <h2 className="text-sm font-medium text-stone-800 mb-2 inline-flex items-center gap-1.5">
              <Mail className="w-4 h-4 text-stone-500" />
              Email
            </h2>
            {initial.email ? (
              <p className="text-xs text-stone-500 mb-3">
                Wiki notifications go to <span className="font-mono">{initial.email}</span>.
              </p>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
                No email address on your account — wiki emails will be skipped until you add one.
              </p>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={emailOptIn}
                onChange={(e) => setEmailOptIn(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-stone-800">Send me wiki emails</span>
            </label>
            <p className="text-xs text-stone-500 mt-2 ml-6">
              Covers weekly digest, flag/comment alerts, daily review reminders, term-expiry
              warnings, steward escalations, and circle / partner-review prompts. Turn off here
              to silence email entirely; in-app + push continue.
            </p>
          </section>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {savedAt && (
            <span className="text-xs text-emerald-700">Saved {savedAt.toLocaleTimeString()}</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </main>
  );
}
