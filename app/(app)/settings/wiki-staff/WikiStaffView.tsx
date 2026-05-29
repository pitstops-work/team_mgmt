"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Plus, X } from "lucide-react";

type StaffRow = {
  id: string;
  wikiRole: string;
  scope: { cities?: string[] } | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string | null; image: string | null };
};

type UserOption = { id: string; name: string | null; email: string | null };

const CITIES = ["bangalore", "chennai"];

export default function WikiStaffView({
  staff: initial,
  users,
}: {
  staff: StaffRow[];
  users: UserOption[];
}) {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffRow[]>(initial);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [userId, setUserId] = useState("");
  const [wikiRole, setWikiRole] = useState<"curator" | "steward">("curator");
  const [scopeCities, setScopeCities] = useState<string[]>([]);

  function toggleCity(c: string) {
    setScopeCities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!userId) {
      setErr("Pick a user.");
      return;
    }
    setBusy("add");
    const res = await fetch("/api/admin/wiki/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, wikiRole, cities: scopeCities }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Failed.");
      return;
    }
    setUserId("");
    setScopeCities([]);
    setShowForm(false);
    router.refresh();
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this designation?")) return;
    setBusy(id);
    const res = await fetch(`/api/admin/wiki/staff/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Failed.");
      return;
    }
    router.refresh();
  }

  const curators = staff.filter((s) => s.wikiRole === "curator");
  const stewards = staff.filter((s) => s.wikiRole === "steward");

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-stone-900 inline-flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-stone-600" /> Wiki staff
          </h1>
          <p className="text-sm text-stone-600 mt-1 max-w-2xl">
            Curators run the weekly gap-queue walk, the stale-page sweep, and translation triage. Stewards have higher-level powers — cross-page edits, retire, designate other staff. One curator per city is the operating norm; stewards stay small (one or two total).{" "}
            <a className="underline" href="/training/modules/practice-documentation/00-induction.html">module 0 of the training</a> covers the role.
          </p>
        </header>

        <div className="mb-4">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-700"
          >
            <Plus className="w-4 h-4" /> {showForm ? "Cancel" : "Designate"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={add} className="mb-6 p-5 bg-white border border-stone-200 rounded-lg">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">User *</span>
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">— pick —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || "—"} · {u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-stone-700 font-medium">Role *</span>
                <select
                  value={wikiRole}
                  onChange={(e) => setWikiRole(e.target.value as "curator" | "steward")}
                  className="mt-1 w-full border border-stone-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="curator">Curator</option>
                  <option value="steward">Steward</option>
                </select>
              </label>
              <div className="block text-sm sm:col-span-2">
                <span className="text-stone-700 font-medium">Scope</span>
                <p className="text-xs text-stone-500 mb-2">
                  Leave empty for global. Tick the cities you want to restrict to.
                </p>
                <div className="flex gap-3 flex-wrap">
                  {CITIES.map((c) => (
                    <label key={c} className="inline-flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={scopeCities.includes(c)}
                        onChange={() => toggleCity(c)}
                        className="rounded border-stone-300"
                      />
                      <span className="capitalize">{c}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {err && <p className="mt-3 text-sm text-rose-700">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={busy === "add"}
                className="px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-700 disabled:opacity-50"
              >
                {busy === "add" ? "Saving…" : "Designate"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-white border border-stone-300 text-sm text-stone-700 rounded-md"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <StaffSection title="Curators" rows={curators} busy={busy} onRevoke={revoke} />
        <StaffSection title="Stewards" rows={stewards} busy={busy} onRevoke={revoke} />
      </div>
    </main>
  );
}

function StaffSection({
  title,
  rows,
  busy,
  onRevoke,
}: {
  title: string;
  rows: StaffRow[];
  busy: string | null;
  onRevoke: (id: string) => void;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wide mb-2">
        {title} <span className="text-stone-400 font-normal">· {rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500 italic p-4 bg-white border border-stone-200 rounded-lg">
          None designated.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="p-3 bg-white border border-stone-200 rounded-lg flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-900 font-medium">{r.user.name || r.user.email || "—"}</div>
                <div className="text-xs text-stone-500">
                  {r.user.email}
                  {" · "}
                  scope:{" "}
                  {r.scope?.cities && r.scope.cities.length > 0
                    ? r.scope.cities.join(", ")
                    : "global"}
                </div>
              </div>
              <button
                onClick={() => onRevoke(r.id)}
                disabled={busy === r.id}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 rounded-md border border-transparent hover:border-rose-200 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" /> Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
