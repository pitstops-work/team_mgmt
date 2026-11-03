"use client";

/**
 * The partner picker — one control, one list, every portal.
 *
 * Reads GET /api/partners, which is backed by the shared registry (Org
 * kind="partner"). Any place that used to take a typed organisation name uses
 * this instead: due diligence, the grant-note drafter and the budget admin all
 * select the same identity, so the same grantee can't exist three times under
 * three spellings.
 *
 * "Not listed? Add a partner" POSTs to the same endpoint, which is idempotent
 * on the normalised name — so a partner that already exists under a different
 * spelling is adopted rather than duplicated. The create path is admin-only
 * server-side; a non-admin gets the refusal shown inline.
 */

import { useEffect, useState } from "react";

export type PickablePartner = {
  id: string;
  name: string;
  grants: { city: string; isActive: boolean }[];
};

export default function PartnerPicker({
  value,
  onChange,
  grantingUnit,
  allowCreate = true,
  placeholder = "Choose a partner…",
  autoFocus = false,
  className = "",
}: {
  /** Org.id, or "" for nothing chosen. */
  value: string;
  onChange: (orgId: string, partner: PickablePartner | null) => void;
  /** Narrow to partners funded by this granting unit. */
  grantingUnit?: string;
  allowCreate?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [partners, setPartners] = useState<PickablePartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const qs = grantingUnit ? `?grantingUnit=${encodeURIComponent(grantingUnit)}` : "";

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/partners${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load partners"))))
      .then((d) => {
        if (live) setPartners(d.partners ?? []);
      })
      .catch((e) => live && setErr(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [qs]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? "Could not add that partner");
      const p: PickablePartner = { id: d.partner.id, name: d.partner.name, grants: d.partner.grants ?? [] };
      setPartners((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p].sort((a, b) => a.name.localeCompare(b.name))));
      onChange(p.id, p);
      setCreating(false);
      setNewName("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add that partner");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {creating ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400 flex-1 min-w-40"
            placeholder="Organisation name"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button
            type="button"
            className="text-sm text-sky-600 hover:underline disabled:opacity-50"
            disabled={saving || !newName.trim()}
            onClick={create}
          >
            {saving ? "Adding…" : "Add"}
          </button>
          <button type="button" className="text-sm text-stone-400" onClick={() => { setCreating(false); setErr(null); }}>
            Cancel
          </button>
        </div>
      ) : (
        <select
          className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400 bg-white"
          value={value}
          autoFocus={autoFocus}
          disabled={loading}
          onChange={(e) => {
            const id = e.target.value;
            onChange(id, partners.find((p) => p.id === id) ?? null);
          }}
        >
          <option value="">{loading ? "Loading partners…" : placeholder}</option>
          {partners.map((p) => {
            const cities = [...new Set(p.grants.map((g) => g.city))].filter(Boolean);
            return (
              <option key={p.id} value={p.id}>
                {p.name}
                {cities.length ? ` — ${cities.join(", ")}` : ""}
              </option>
            );
          })}
        </select>
      )}
      {!creating && allowCreate && (
        <button type="button" className="self-start text-xs text-sky-600 hover:underline" onClick={() => setCreating(true)}>
          Not listed? Add a partner
        </button>
      )}
      {err && <div className="text-xs text-red-600">{err}</div>}
    </div>
  );
}
