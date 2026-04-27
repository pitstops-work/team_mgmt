"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface FacilityLayer {
  id: string;
  layerKey: string;
  label: string;
  sortOrder: number;
}

type EditState = {
  id?: string;
  layerKey: string;
  label: string;
  sortOrder: number;
} | null;

const inputCls = "px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-300 bg-white";

export default function FacilityLayersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "super-admin";

  const [layers, setLayers] = useState<FacilityLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/facility-layers");
    if (res.ok) setLayers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (session && !isAdmin) router.replace("/settings");
  }, [session, isAdmin, router]);

  if (!isAdmin) return null;

  const handleSave = async () => {
    if (!edit) return;
    setSaving(true);
    setError("");
    try {
      const res = edit.id
        ? await fetch(`/api/admin/facility-layers/${edit.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ layerKey: edit.layerKey, label: edit.label, sortOrder: edit.sortOrder }),
          })
        : await fetch("/api/admin/facility-layers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ layerKey: edit.layerKey, label: edit.label, sortOrder: edit.sortOrder }),
          });
      if (res.ok) {
        setEdit(null);
        load();
      } else {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Remove "${label}"? Templates using this layer key will still work, but it won't appear in new dropdowns.`)) return;
    await fetch(`/api/admin/facility-layers/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings" className="text-stone-400 hover:text-stone-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-semibold text-stone-900">Facility Layer Types</h1>
      </div>

      <p className="text-sm text-stone-500 mb-6 leading-relaxed">
        These facility types appear in the template builder&apos;s &ldquo;Linked facility type&rdquo; dropdown
        and in the goal creation wizard when selecting an existing facility.
        The <strong>Layer Key</strong> must match the{" "}
        <code className="bg-stone-100 px-1 rounded text-xs">layerKey</code> values used in{" "}
        <Link href="/settings/map-features" className="text-sky-600 hover:underline">Map Features</Link>{" "}
        (e.g. <code className="bg-stone-100 px-1 rounded text-xs">creches</code>).
      </p>

      <div className="mb-2 grid grid-cols-[160px_1fr_48px_88px] gap-2 px-4">
        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Layer Key</span>
        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Display Label</span>
        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Order</span>
        <span />
      </div>

      {loading ? (
        <p className="text-sm text-stone-400 text-center py-8">Loading…</p>
      ) : (
        <div className="space-y-2 mb-4">
          {layers.map((layer) => (
            <div key={layer.id} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 rounded-xl">
              {edit?.id === layer.id ? (
                <>
                  <input
                    className={inputCls + " w-40 font-mono text-xs"}
                    value={edit.layerKey}
                    onChange={e => setEdit({ ...edit, layerKey: e.target.value.replace(/\s/g, "_").toLowerCase() })}
                    placeholder="layer_key"
                  />
                  <input
                    className={inputCls + " flex-1"}
                    value={edit.label}
                    onChange={e => setEdit({ ...edit, label: e.target.value })}
                    placeholder="Display label"
                  />
                  <input
                    type="number"
                    className={inputCls + " w-12 text-center"}
                    value={edit.sortOrder}
                    onChange={e => setEdit({ ...edit, sortOrder: Number(e.target.value) })}
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={handleSave}
                      disabled={saving || !edit.layerKey || !edit.label}
                      className="p-1.5 hover:bg-emerald-50 rounded text-emerald-600 disabled:opacity-40 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setEdit(null); setError(""); }}
                      className="p-1.5 hover:bg-stone-100 rounded text-stone-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <code className="text-xs text-stone-500 font-mono w-40 shrink-0">{layer.layerKey}</code>
                  <span className="text-sm font-medium text-stone-800 flex-1">{layer.label}</span>
                  <span className="text-xs text-stone-400 w-12 text-center">{layer.sortOrder}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEdit({ id: layer.id, layerKey: layer.layerKey, label: layer.label, sortOrder: layer.sortOrder })}
                      className="p-1.5 hover:bg-stone-50 rounded text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(layer.id, layer.label)}
                      className="p-1.5 hover:bg-red-50 rounded text-stone-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {layers.length === 0 && !edit && (
            <p className="text-sm text-stone-400 italic text-center py-8">No facility types yet.</p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      {edit && !edit.id ? (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-sky-50 border border-sky-200 rounded-xl mb-4">
          <input
            autoFocus
            className={inputCls + " w-40 font-mono text-xs"}
            value={edit.layerKey}
            onChange={e => setEdit({ ...edit, layerKey: e.target.value.replace(/\s/g, "_").toLowerCase() })}
            placeholder="layer_key"
          />
          <input
            className={inputCls + " flex-1"}
            value={edit.label}
            onChange={e => setEdit({ ...edit, label: e.target.value })}
            placeholder="Display label"
          />
          <input
            type="number"
            className={inputCls + " w-12 text-center"}
            value={edit.sortOrder}
            onChange={e => setEdit({ ...edit, sortOrder: Number(e.target.value) })}
            placeholder="0"
          />
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              disabled={saving || !edit.layerKey || !edit.label}
              className="p-1.5 hover:bg-emerald-50 rounded text-emerald-600 disabled:opacity-40 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setEdit(null); setError(""); }}
              className="p-1.5 hover:bg-stone-100 rounded text-stone-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEdit({ layerKey: "", label: "", sortOrder: layers.length })}
          className="flex items-center gap-2 w-full px-4 py-3 border-2 border-dashed border-stone-200 rounded-xl text-sm text-stone-500 hover:border-stone-300 hover:text-stone-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add facility type
        </button>
      )}
    </div>
  );
}
