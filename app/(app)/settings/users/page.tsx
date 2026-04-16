"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { Trash2, KeyRound, UserPlus, ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  createdAt: string;
}

export default function UserManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Create user form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Reset password state per user
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  const isAdmin = session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  useEffect(() => {
    if (status === "loading") return;
    // Redirect non-admins: check via API (NEXT_PUBLIC_ADMIN_EMAIL may not be set)
    if (status === "unauthenticated") { router.replace("/login"); return; }

    fetch("/api/admin/users")
      .then(r => {
        if (r.status === 403) { router.replace("/settings"); return null; }
        return r.json();
      })
      .then(data => { if (data) setUsers(data); })
      .finally(() => setLoading(false));
  }, [status, router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, email: newEmail, password: newPassword }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) { setCreateError(data.error ?? "Failed"); return; }
    setUsers(prev => [...prev, data]);
    setNewName(""); setNewEmail(""); setNewPassword("");
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`Delete ${email}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== id));
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError("");
    setResetting(true);
    const res = await fetch(`/api/admin/users/${resetTarget}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPw }),
    });
    const data = await res.json();
    setResetting(false);
    if (!res.ok) { setResetError(data.error ?? "Failed"); return; }
    setResetTarget(null);
    setResetPw("");
  }

  void isAdmin;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex gap-1">
          {[0, 150, 300].map(d => (
            <span key={d} className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/settings" className="text-stone-400 hover:text-stone-600">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">User Management</h1>
        <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">{users.length} users</span>
      </div>

      {/* User list */}
      <section className="mb-10">
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl">
              <Avatar name={u.name} image={u.image} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{u.name ?? <span className="text-stone-400 italic">no name</span>}</p>
                <p className="text-xs text-stone-400 truncate">{u.email}</p>
                <p className="text-xs text-stone-300 mt-0.5">
                  Joined {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => { setResetTarget(u.id); setResetPw(""); setResetError(""); setShowResetPw(false); }}
                  title="Reset password"
                  className="p-1.5 text-stone-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(u.id, u.email)}
                  title="Delete user"
                  className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Reset password inline form */}
      {resetTarget && (
        <section className="mb-10 p-4 bg-sky-50 border border-sky-200 rounded-xl">
          <h2 className="text-sm font-semibold text-sky-800 mb-3">
            Reset password for <span className="font-bold">{users.find(u => u.id === resetTarget)?.email}</span>
          </h2>
          <form onSubmit={handleResetPassword} className="flex items-end gap-2">
            <div className="flex-1 relative">
              <input
                type={showResetPw ? "text" : "password"}
                value={resetPw}
                onChange={e => setResetPw(e.target.value)}
                placeholder="New password (min 8 chars)"
                minLength={8}
                required
                autoFocus
                className="w-full px-3 py-2 text-sm border border-sky-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white pr-9"
              />
              <button
                type="button"
                onClick={() => setShowResetPw(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={resetting}
              className="px-3 py-2 text-sm font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50"
            >
              {resetting ? "Saving…" : "Set"}
            </button>
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="px-3 py-2 text-sm text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-50"
            >
              Cancel
            </button>
          </form>
          {resetError && <p className="text-xs text-red-500 mt-2">{resetError}</p>}
        </section>
      )}

      {/* Create user */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-stone-400" />
          <h2 className="text-sm font-semibold text-stone-700">Add User</h2>
        </div>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Full name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white"
            />
            <input
              type="email"
              placeholder="Email"
              required
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white"
            />
          </div>
          <div className="relative max-w-xs">
            <input
              type={showNewPw ? "text" : "password"}
              placeholder="Password (min 8 chars)"
              required
              minLength={8}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white pr-9"
            />
            <button
              type="button"
              onClick={() => setShowNewPw(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {createError && <p className="text-xs text-red-500">{createError}</p>}
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create user"}
          </button>
        </form>
      </section>
    </div>
  );
}
