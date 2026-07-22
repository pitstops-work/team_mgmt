"use client";

import { useState, useTransition } from "react";

export default function MembersClient({
  roles, plans, addAction,
}: {
  roles: { key: string; label: string; scope: string }[];
  plans: { id: string; name: string }[];
  addAction: (input: { userEmail: string; role: string; planId: string | null }) => Promise<void>;
  removeAction: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[0]?.key ?? "");
  const [planId, setPlanId] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const currentScope = roles.find((r) => r.key === role)?.scope;

  function submit() {
    setErr(null);
    startTransition(async () => {
      try {
        await addAction({
          userEmail: email,
          role,
          planId: currentScope === "central" ? null : (planId || null),
        });
        setEmail("");
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
      {err && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">{err}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
        <input placeholder="User email" className="rounded-lg border border-stone-300 px-2 py-1.5" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select className="rounded-lg border border-stone-300 px-2 py-1.5" value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <select className="rounded-lg border border-stone-300 px-2 py-1.5" value={planId} onChange={(e) => setPlanId(e.target.value)} disabled={currentScope === "central"}>
          <option value="">{currentScope === "central" ? "all plans (central)" : "— pick a plan —"}</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button disabled={pending || !email || !role} onClick={submit} className="rounded-full bg-sky-500 text-white px-3 py-1.5 hover:bg-sky-600 disabled:opacity-50">Add member</button>
      </div>
    </div>
  );
}
