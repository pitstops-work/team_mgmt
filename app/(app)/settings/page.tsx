"use client";

import { useState, useEffect } from "react";
import { Copy, Check, RefreshCw, Users, KeyRound } from "lucide-react";
import Avatar from "@/components/Avatar";

type Member = { id: string; name: string | null; email: string | null; image: string | null };

export default function SettingsPage() {
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

  useEffect(() => {
    Promise.all([
      fetch("/api/invite-code").then((r) => r.json()).then((d) => setCode(d.code)),
      fetch("/api/users").then((r) => r.json()).then(setMembers),
    ]);
  }, []);

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

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <h1 className="text-xl font-semibold text-stone-900 mb-8">Settings</h1>

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
