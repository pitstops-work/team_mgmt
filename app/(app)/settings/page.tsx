"use client";

import { useState, useEffect } from "react";
import { Copy, Check, RefreshCw, Users, KeyRound, CalendarDays, Target, ChevronRight, ShieldCheck, Map, Languages } from "lucide-react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { useSession } from "next-auth/react";

type Member = { id: string; name: string | null; email: string | null; image: string | null };

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const [externalCalUrl, setExternalCalUrl] = useState("");
  const [calSaving, setCalSaving] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [calSuccess, setCalSuccess] = useState(false);

  const [preferredLang, setPreferredLang] = useState("en");
  const [langSaving, setLangSaving] = useState(false);
  const [langSuccess, setLangSuccess] = useState(false);

  const LANGS = [
    { code: "en", label: "English",   native: "English"   },
    { code: "ta", label: "Tamil",     native: "தமிழ்"    },
    { code: "kn", label: "Kannada",   native: "ಕನ್ನಡ"   },
    { code: "ml", label: "Malayalam", native: "മലയാളം"   },
    { code: "hi", label: "Hindi",     native: "हिन्दी"   },
    { code: "bn", label: "Bengali",   native: "বাংলা"    },
  ];

  useEffect(() => {
    Promise.all([
      fetch("/api/invite-code").then((r) => r.json()).then((d) => setCode(d.code)),
      fetch("/api/users").then((r) => r.json()).then(setMembers),
      fetch("/api/account/external-calendar").then((r) => r.json()).then((d) => {
        if (d.url) setExternalCalUrl(d.url);
      }),
      fetch("/api/account/language").then((r) => r.json()).then((d) => {
        if (d.lang) setPreferredLang(d.lang);
      }),
    ]);
  }, []);

  const handleSaveLang = async (lang: string) => {
    setLangSaving(true);
    setLangSuccess(false);
    await fetch("/api/account/language", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    setPreferredLang(lang);
    setLangSaving(false);
    setLangSuccess(true);
    setTimeout(() => setLangSuccess(false), 2000);
  };

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRotate = async () => {
    if (!confirm("Rotate the invite code? The old code will stop working immediately.")) return;
    setRotating(true);
    const res = await fetch("/api/invite-code", { method: "POST" });
    const data = await res.json();
    setCode(data.code);
    setRotating(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match");
      return;
    }
    setPwSaving(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setPwSaving(false);
    if (!res.ok) {
      setPwError(data.error ?? "Something went wrong");
    } else {
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleSaveCalUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setCalError(null);
    setCalSuccess(false);
    setCalSaving(true);
    const res = await fetch("/api/account/external-calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: externalCalUrl }),
    });
    const data = await res.json();
    setCalSaving(false);
    if (!res.ok) setCalError(data.error ?? "Something went wrong");
    else setCalSuccess(true);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <h1 className="text-xl font-semibold text-stone-900 mb-8">Settings</h1>

      {/* Field Coverage */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-stone-700 mb-1">Field Coverage</h2>
        <p className="text-xs text-stone-500 mb-3">Configure target formulas and entitlement schemes.</p>
        <div className="space-y-2">
          <Link
            href="/settings/needs"
            className="flex items-center gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 hover:border-stone-300 transition-colors"
          >
            <Target className="w-4 h-4 text-sky-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-800">Formulas &amp; Schemes</p>
              <p className="text-xs text-stone-400">Target denominators · Entitlement scheme list</p>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-300" />
          </Link>
          <Link
            href="/settings/geography"
            className="flex items-center gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 hover:border-stone-300 transition-colors"
          >
            <Map className="w-4 h-4 text-sky-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-800">Geography</p>
              <p className="text-xs text-stone-400">Zones · clusters · settlements</p>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-300" />
          </Link>
        </div>
      </section>

      {/* User management — admin only */}
      {isAdmin && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-stone-700 mb-1">Administration</h2>
          <p className="text-xs text-stone-500 mb-3">Manage user accounts — only visible to you.</p>
          <Link
            href="/settings/users"
            className="flex items-center gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 hover:border-stone-300 transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-800">User Management</p>
              <p className="text-xs text-stone-400">Add · delete · reset passwords</p>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-300" />
          </Link>
        </section>
      )}

      {/* Invite code */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-stone-700 mb-1">Invite Code</h2>
        <p className="text-xs text-stone-500 mb-4">
          Share this code with people you want to invite. They'll need it to register.
          Rotating the code prevents new signups with the old code.
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl">
            <span className="font-mono text-lg font-semibold text-stone-900 tracking-widest">
              {code ?? "Loading..."}
            </span>
          </div>

          <button
            onClick={handleCopy}
            disabled={!code}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors disabled:opacity-40"
            title="Copy code"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-stone-500" />}
            <span className="text-stone-600">{copied ? "Copied" : "Copy"}</span>
          </button>

          <button
            onClick={handleRotate}
            disabled={rotating || !code}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm border border-stone-200 rounded-xl hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors disabled:opacity-40"
            title="Rotate code"
          >
            <RefreshCw className={`w-4 h-4 ${rotating ? "animate-spin" : ""}`} />
            <span>Rotate</span>
          </button>
        </div>
      </section>

      {/* Change Password */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-stone-400" />
          <h2 className="text-sm font-semibold text-stone-700">Change Password</h2>
        </div>
        <p className="text-xs text-stone-500 mb-4">
          Enter your current password to set a new one.
        </p>

        <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white"
          />
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white"
          />

          {pwError && <p className="text-xs text-red-500">{pwError}</p>}
          {pwSuccess && <p className="text-xs text-emerald-600">Password updated successfully.</p>}

          <button
            type="submit"
            disabled={pwSaving}
            className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {pwSaving ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>

      {/* External Calendar */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays className="w-4 h-4 text-stone-400" />
          <h2 className="text-sm font-semibold text-stone-700">My Outlook / Google Calendar</h2>
        </div>
        <p className="text-xs text-stone-500 mb-4">
          Paste your calendar&apos;s iCal (.ics) subscription URL here. Your personal events will appear
          in grey on the Activities calendar — read-only, visible only to you.
        </p>
        <details className="mb-3 text-xs text-stone-400 group">
          <summary className="cursor-pointer hover:text-stone-600 select-none">How to get the URL from Outlook</summary>
          <ol className="mt-2 space-y-1 pl-4 list-decimal text-stone-500">
            <li>Open <strong>Outlook on the web</strong> (outlook.office.com or outlook.live.com)</li>
            <li>Go to <strong>Calendar → Settings (gear icon) → View all Outlook settings</strong></li>
            <li>Select <strong>Calendar → Shared calendars</strong></li>
            <li>Under <strong>Publish a calendar</strong>, choose your calendar and set permissions to <em>Can view all details</em></li>
            <li>Click <strong>Publish</strong> — copy the <strong>ICS</strong> link (not the HTML one)</li>
          </ol>
        </details>
        <form onSubmit={handleSaveCalUrl} className="space-y-3 max-w-lg">
          <input
            type="url"
            placeholder="https://outlook.live.com/owa/calendar/…/calendar.ics"
            value={externalCalUrl}
            onChange={(e) => { setExternalCalUrl(e.target.value); setCalSuccess(false); }}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white font-mono"
          />
          {calError && <p className="text-xs text-red-500">{calError}</p>}
          {calSuccess && <p className="text-xs text-emerald-600">Calendar URL saved. Your events will appear on Activities.</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={calSaving}
              className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
            >
              {calSaving ? "Saving…" : "Save"}
            </button>
            {externalCalUrl && (
              <button
                type="button"
                onClick={() => { setExternalCalUrl(""); setCalSuccess(false); }}
                className="px-4 py-2 text-sm text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Language */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <Languages className="w-4 h-4 text-stone-400" />
          <h2 className="text-sm font-semibold text-stone-700">My Language</h2>
        </div>
        <p className="text-xs text-stone-500 mb-4">
          Thread messages will be shown in this language. Voice messages you record will be
          translated for everyone else in their own language.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-sm">
          {LANGS.map((l) => (
            <button
              key={l.code}
              disabled={langSaving}
              onClick={() => handleSaveLang(l.code)}
              className={`flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                preferredLang === l.code
                  ? "border-stone-800 bg-stone-900 text-white"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-300"
              }`}
            >
              <span className="text-xs font-medium">{l.label}</span>
              <span className={`text-xs mt-0.5 ${preferredLang === l.code ? "text-stone-300" : "text-stone-400"}`}>
                {l.native}
              </span>
            </button>
          ))}
        </div>
        {langSuccess && <p className="text-xs text-emerald-600 mt-3">Language preference saved.</p>}
      </section>

      {/* Members */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-stone-400" />
          <h2 className="text-sm font-semibold text-stone-700">Members</h2>
          <span className="text-xs text-stone-400">({members.length})</span>
        </div>

        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-stone-200 rounded-lg">
              <Avatar name={m.name} image={m.image} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{m.name ?? "—"}</p>
                <p className="text-xs text-stone-400 truncate">{m.email}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
