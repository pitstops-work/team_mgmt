"use client";

import { useState } from "react";
import { SUPPORTED_LANGS } from "@/lib/langs";

export default function AccountPanel({ email, name, initialLang }: { email: string; name: string | null; initialLang: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  const [lang, setLang] = useState(initialLang);
  const [langSaving, setLangSaving] = useState(false);
  const [langOk, setLangOk] = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null); setPwOk(false);
    if (next.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setPwError("New passwords do not match."); return; }
    setPwSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update password");
      setPwOk(true); setCurrent(""); setNext(""); setConfirm("");
    } catch (e: any) {
      setPwError(e.message ?? "Could not update password");
    } finally {
      setPwSaving(false);
    }
  }

  async function saveLang(code: string) {
    setLangOk(false); setLangSaving(true);
    const prev = lang;
    setLang(code);
    try {
      const res = await fetch("/api/account/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: code }),
      });
      if (!res.ok) throw new Error();
      setLangOk(true);
    } catch {
      setLang(prev);
    } finally {
      setLangSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Account</h1>
        <p className="text-sm text-stone-500 mt-0.5">{name ? `${name} · ` : ""}{email}</p>
      </div>

      {/* Change password */}
      <section>
        <h2 className="text-sm font-semibold text-stone-700 mb-1">Change password</h2>
        <p className="text-xs text-stone-500 mb-4">Enter your current password to set a new one.</p>
        <form onSubmit={handlePassword} className="space-y-3 max-w-sm">
          <input type="password" placeholder="Current password" value={current} onChange={e => setCurrent(e.target.value)} required
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white" />
          <input type="password" placeholder="New password (min 8 characters)" value={next} onChange={e => setNext(e.target.value)} required minLength={8}
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white" />
          <input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} required
            className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white" />
          {pwError && <p className="text-xs text-red-500">{pwError}</p>}
          {pwOk && <p className="text-xs text-emerald-600">Password updated successfully.</p>}
          <button type="submit" disabled={pwSaving}
            className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50">
            {pwSaving ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>

      {/* Language */}
      <section>
        <h2 className="text-sm font-semibold text-stone-700 mb-1">My language</h2>
        <p className="text-xs text-stone-500 mb-4">The portal and messages will be shown in this language.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-sm">
          {SUPPORTED_LANGS.map(l => (
            <button key={l.code} disabled={langSaving} onClick={() => saveLang(l.code)}
              className={`flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-colors disabled:opacity-50 ${
                lang === l.code ? "border-stone-800 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 hover:border-stone-300"
              }`}>
              <span className="text-xs font-medium">{l.label}</span>
              <span className={`text-xs mt-0.5 ${lang === l.code ? "text-stone-300" : "text-stone-400"}`}>{l.native}</span>
            </button>
          ))}
        </div>
        {langOk && <p className="text-xs text-emerald-600 mt-3">Language preference saved.</p>}
      </section>
    </div>
  );
}
