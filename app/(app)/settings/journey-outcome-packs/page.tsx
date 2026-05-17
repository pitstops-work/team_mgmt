"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Pencil, Trash2, Check, X, Layers } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type PackOutcome = {
  key: string;
  label: string;
  description?: string | null;
  unit?: string | null;
  captureSource?: "MANUAL_ADMIN" | "RP_ACTIVITY";
  bindingTemplateSlug?: string | null;
  bindingChecklistKey?: string | null;
  targetValue?: number | null;
  targetCadence?: string | null;
  sortOrder?: number;
};

type Pack = {
  id: string;
  key: string;
  label: string;
  domain: string | null;
  notes: string | null;
  outcomes: PackOutcome[];
  createdAt: string;
  updatedAt: string;
};

const inputCls = "px-2 py-1 text-xs border border-stone-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-stone-300";

export default function JourneyOutcomePacksPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "super-admin";

  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Pack | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/journey-outcome-packs");
    if (res.ok) setPacks(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { if (session && !isAdmin) router.replace("/settings"); }, [session, isAdmin, router]);
  useEffect(() => { load(); }, [load]);

  if (!isAdmin) return null;

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.key || !editing.label) { setError("key + label required"); return; }
    setBusy(true);
    setError("");
    const body = {
      key: editing.key,
      label: editing.label,
      domain: editing.domain || null,
      notes: editing.notes || null,
      outcomes: editing.outcomes,
    };
    const res = packs.find(p => p.id === editing.id)
      ? await fetch(`/api/admin/journey-outcome-packs/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch(`/api/admin/journey-outcome-packs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) { setEditing(null); load(); }
    else { const d = await res.json(); setError(d.error ?? "Failed to save"); }
  };

  const handleDelete = async (pack: Pack) => {
    if (!confirm(`Delete pack "${pack.label}"? Existing journeys keep their outcomes.`)) return;
    await fetch(`/api/admin/journey-outcome-packs/${pack.id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/settings" className="text-stone-400 hover:text-stone-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <Layers className="w-4 h-4 text-stone-400" />
        <h1 className="text-xl font-semibold text-stone-900">Journey Outcome Packs</h1>
      </div>
      <p className="text-xs text-stone-500 mb-5 leading-relaxed">
        Packs let you author a set of outcome definitions once and apply them to any matching journey with one click. Useful for repeating outcome trios (e.g. ECD ladder: enrolled / attending / mainstreamed) across many settlements.
      </p>

      {loading ? (
        <p className="text-sm text-stone-400 text-center py-8">Loading…</p>
      ) : (
        <div className="space-y-2 mb-3">
          {packs.map(p => (
            editing?.id === p.id ? null : (
              <div key={p.id} className="flex items-start gap-3 px-4 py-3 bg-white border border-stone-200 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-stone-800">{p.label}</span>
                    <code className="text-[10px] text-stone-400 font-mono">{p.key}</code>
                    {p.domain && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-50 text-stone-500">{p.domain}</span>}
                    <span className="text-[10px] text-stone-400">{p.outcomes.length} outcome{p.outcomes.length === 1 ? "" : "s"}</span>
                  </div>
                  {p.notes && <p className="text-[11px] text-stone-500 mt-1">{p.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setEditing({ ...p })} className="p-1.5 hover:bg-stone-50 rounded text-stone-400 hover:text-stone-600">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(p)} className="p-1.5 hover:bg-red-50 rounded text-stone-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          ))}
          {packs.length === 0 && !editing && (
            <p className="text-sm text-stone-400 italic text-center py-6">No packs yet.</p>
          )}
        </div>
      )}

      {editing && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-3 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-stone-500 mb-0.5">Label</label>
              <input className={inputCls + " w-full"} value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value, key: editing.key || e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_") })} placeholder="ECD outcome ladder" />
            </div>
            <div>
              <label className="block text-[10px] text-stone-500 mb-0.5">Key</label>
              <input className={inputCls + " w-full font-mono"} value={editing.key} onChange={e => setEditing({ ...editing, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="ecd_ladder" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-stone-500 mb-0.5">Domain filter (optional)</label>
              <input className={inputCls + " w-full"} value={editing.domain ?? ""} onChange={e => setEditing({ ...editing, domain: e.target.value || null })} placeholder="Creche, WaterATM, …" />
            </div>
            <div>
              <label className="block text-[10px] text-stone-500 mb-0.5">Notes</label>
              <input className={inputCls + " w-full"} value={editing.notes ?? ""} onChange={e => setEditing({ ...editing, notes: e.target.value || null })} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-stone-500">Outcomes</span>
              <button onClick={() => setEditing({ ...editing, outcomes: [...editing.outcomes, { key: "", label: "", captureSource: "MANUAL_ADMIN" }] })} className="text-[10px] text-stone-500 hover:text-stone-800 flex items-center gap-0.5">
                <Plus className="w-2.5 h-2.5" /> add
              </button>
            </div>
            <div className="space-y-1.5">
              {editing.outcomes.map((o, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_80px_120px_24px] gap-1.5 items-center">
                  <input className={inputCls} placeholder="key" value={o.key} onChange={e => setEditing({ ...editing, outcomes: editing.outcomes.map((x, j) => j === i ? { ...x, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") } : x) })} />
                  <input className={inputCls} placeholder="label" value={o.label} onChange={e => setEditing({ ...editing, outcomes: editing.outcomes.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} />
                  <input className={inputCls} placeholder="unit" value={o.unit ?? ""} onChange={e => setEditing({ ...editing, outcomes: editing.outcomes.map((x, j) => j === i ? { ...x, unit: e.target.value || null } : x) })} />
                  <select className={inputCls} value={o.captureSource ?? "MANUAL_ADMIN"} onChange={e => setEditing({ ...editing, outcomes: editing.outcomes.map((x, j) => j === i ? { ...x, captureSource: e.target.value as "MANUAL_ADMIN" | "RP_ACTIVITY" } : x) })}>
                    <option value="MANUAL_ADMIN">Manual</option>
                    <option value="RP_ACTIVITY">RP activity</option>
                  </select>
                  <button onClick={() => setEditing({ ...editing, outcomes: editing.outcomes.filter((_, j) => j !== i) })} className="text-stone-300 hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {editing.outcomes.length === 0 && <p className="text-[10px] text-stone-400 italic">No outcomes yet.</p>}
            </div>
            <p className="text-[10px] text-stone-400 mt-1.5">Tip: RP_ACTIVITY outcomes copy as unbound; pick template + checklist item on the journey after applying.</p>
          </div>

          <div className="flex justify-end items-center gap-2 pt-1">
            {error && <span className="text-[10px] text-red-500">{error}</span>}
            <button onClick={() => { setEditing(null); setError(""); }} className="px-3 py-1 text-xs rounded-lg text-stone-500 hover:bg-stone-100"><X className="w-3 h-3" /></button>
            <button onClick={handleSave} disabled={busy} className="px-3 py-1 text-xs rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 flex items-center gap-1">
              <Check className="w-3 h-3" /> {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {!editing && (
        <button onClick={() => setEditing({ id: "", key: "", label: "", domain: null, notes: null, outcomes: [], createdAt: "", updatedAt: "" })} className="flex items-center gap-2 w-full px-4 py-3 border-2 border-dashed border-stone-200 rounded-xl text-sm text-stone-500 hover:border-stone-300 hover:text-stone-700">
          <Plus className="w-4 h-4" /> New pack
        </button>
      )}
    </div>
  );
}
