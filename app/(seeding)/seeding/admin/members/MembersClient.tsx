"use client";

import { useState, useTransition } from "react";
import { addSeedingMember, removeSeedingMember } from "../../actions";

type Member = { id: string; role: string; userName: string; geoLabel: string | null };
type Opt = { id: string; label: string };
type Role = { key: string; label: string; scope: string };

export default function MembersClient({ members, users, geos, roles }: { members: Member[]; users: Opt[]; geos: Opt[]; roles: Role[] }) {
  const [pending, start] = useTransition();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState(roles[0]?.key ?? "");
  const [geoId, setGeoId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const roleScope = roles.find((r) => r.key === role)?.scope;
  const geoRequired = roleScope === "geo";

  const run = (fn: () => Promise<void>) => start(async () => { setErr(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } });

  return (
    <div className="space-y-5">
      <div>
        <a href="/seeding" className="text-xs text-stone-400 hover:text-stone-600">← Dashboard</a>
        <h1 className="text-xl font-semibold text-stone-900 mt-1">Seeding members</h1>
        <p className="text-sm text-stone-500 mt-0.5">Who can use the portal. Central roles see all geos; geo roles are scoped to one geography; viewers are read-only.</p>
      </div>

      {/* Add */}
      <div className="rounded-xl border border-stone-200 bg-white p-4 flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-stone-500 flex-1 min-w-[12rem]">Person
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 block w-full rounded border border-stone-300 px-2 py-1.5 text-sm">
            <option value="">Select a user…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Role
          <select value={role} onChange={(e) => { setRole(e.target.value); setGeoId(""); }} className="mt-1 block rounded border border-stone-300 px-2 py-1.5 text-sm">
            {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-stone-500">Geography
          <select value={geoId} onChange={(e) => setGeoId(e.target.value)} disabled={roleScope === "central"} className="mt-1 block rounded border border-stone-300 px-2 py-1.5 text-sm disabled:bg-stone-50 disabled:text-stone-400">
            <option value="">{roleScope === "central" ? "All (central)" : "Select…"}</option>
            {geos.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>
        <button
          disabled={pending || !userId || !role || (geoRequired && !geoId)}
          onClick={() => run(async () => { await addSeedingMember(userId, role, geoId || null); setUserId(""); setGeoId(""); })}
          className="text-sm bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50">Add member</button>
      </div>
      {err && <div className="text-xs text-rose-600">{err}</div>}

      {/* List */}
      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden">
        {members.length === 0 && <div className="px-4 py-10 text-center text-sm text-stone-400">No members yet — add the core team above.</div>}
        {members.map((m) => (
          <div key={m.id} className="px-4 py-2.5 flex items-center gap-3">
            <span className="text-sm text-stone-800 flex-1">{m.userName}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{roles.find((r) => r.key === m.role)?.label ?? m.role}</span>
            {m.geoLabel && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">{m.geoLabel}</span>}
            <button disabled={pending} onClick={() => run(() => removeSeedingMember(m.id))} className="text-[11px] text-rose-400 hover:text-rose-600">Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
