"use client";

import { useState } from "react";
import { LAYERS } from "@/lib/layers";

interface DBPartner {
  id: string;
  key: string;
  label: string;
  color: string;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  isBuiltIn: boolean;
  createdAt: Date;
}

interface PartnersPageProps {
  dbPartners: DBPartner[];
}

const PRESET_COLORS = [
  "#6366f1", "#10b981", "#ef4444", "#f59e0b",
  "#ec4899", "#8b5cf6", "#f97316", "#06b6d4",
  "#0ea5e9", "#84cc16", "#a855f7", "#14b8a6",
];

const builtInPartners = LAYERS.filter((l) => l.type === "polygon" && l.key !== "custom_settlements");

export default function PartnersPage({ dbPartners: initialDbPartners }: PartnersPageProps) {
  const [dbPartners, setDbPartners] = useState<DBPartner[]>(initialDbPartners);
  const [editingPartner, setEditingPartner] = useState<DBPartner | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add partner form state
  const [addForm, setAddForm] = useState({
    label: "", key: "", color: "#6366f1",
    contactName: "", contactPhone: "", notes: "",
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Edit partner form state
  const [editForm, setEditForm] = useState({
    color: "#6366f1", contactName: "", contactPhone: "", notes: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  function openEditModal(partner: DBPartner | null, layerKey?: string) {
    if (partner) {
      setEditingPartner(partner);
      setEditForm({
        color: partner.color,
        contactName: partner.contactName ?? "",
        contactPhone: partner.contactPhone ?? "",
        notes: partner.notes ?? "",
      });
    } else if (layerKey) {
      // Edit built-in partner — look up or create a stub
      const existing = dbPartners.find((p) => p.key === layerKey);
      const layer = builtInPartners.find((l) => l.key === layerKey);
      if (existing) {
        setEditingPartner(existing);
        setEditForm({
          color: existing.color,
          contactName: existing.contactName ?? "",
          contactPhone: existing.contactPhone ?? "",
          notes: existing.notes ?? "",
        });
      } else {
        // Create a stub for the built-in partner
        setEditingPartner({
          id: "",
          key: layerKey,
          label: layer?.label ?? layerKey,
          color: layer?.color ?? "#6366f1",
          contactName: null,
          contactPhone: null,
          notes: null,
          isBuiltIn: true,
          createdAt: new Date(),
        });
        setEditForm({
          color: layer?.color ?? "#6366f1",
          contactName: "",
          contactPhone: "",
          notes: "",
        });
      }
    }
  }

  async function handleEditSave() {
    if (!editingPartner) return;
    setEditSaving(true);
    try {
      if (editingPartner.id) {
        // Update existing record
        const res = await fetch(`/api/map/partners?id=${editingPartner.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
        });
        if (res.ok) {
          const updated = await res.json() as DBPartner;
          setDbPartners((prev) => prev.map((p) => p.id === updated.id ? updated : p));
          setEditingPartner(null);
        }
      } else {
        // Create new record for built-in partner
        const res = await fetch("/api/map/partners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: editingPartner.key,
            label: editingPartner.label,
            isBuiltIn: true,
            ...editForm,
          }),
        });
        if (res.ok) {
          const created = await res.json() as DBPartner;
          setDbPartners((prev) => [...prev, created]);
          setEditingPartner(null);
        }
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function handleAddSave() {
    setAddError("");
    if (!addForm.label.trim() || !addForm.key.trim()) {
      setAddError("Label and key are required.");
      return;
    }
    setAddSaving(true);
    try {
      const res = await fetch("/api/map/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: addForm.key.trim(),
          label: addForm.label.trim(),
          color: addForm.color,
          contactName: addForm.contactName.trim() || null,
          contactPhone: addForm.contactPhone.trim() || null,
          notes: addForm.notes.trim() || null,
          isBuiltIn: false,
        }),
      });
      if (res.ok) {
        const created = await res.json() as DBPartner;
        setDbPartners((prev) => [...prev, created]);
        setAddForm({ label: "", key: "", color: "#6366f1", contactName: "", contactPhone: "", notes: "" });
        setShowAddModal(false);
      } else {
        const data = await res.json() as { error?: string };
        setAddError(data.error ?? "Failed to create partner.");
      }
    } finally {
      setAddSaving(false);
    }
  }

  const customDbPartners = dbPartners.filter((p) => !p.isBuiltIn);
  const dbByKey = Object.fromEntries(dbPartners.map((p) => [p.key, p]));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Partners</h1>
          <p className="text-sm text-slate-500 mt-0.5">Programme partner NGOs and their settlement coverage</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <span className="text-base">+</span> Add Partner
        </button>
      </div>

      {/* Built-in partners */}
      <section className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Programme Partners</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {builtInPartners.map((layer) => {
            const db = dbByKey[layer.key];
            const color = db?.color ?? layer.color;
            return (
              <button
                key={layer.key}
                onClick={() => openEditModal(db ?? null, layer.key)}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="w-5 h-5 rounded-md flex-shrink-0"
                    style={{ background: color }}
                  />
                  <span className="font-semibold text-slate-800 text-sm">{layer.label}</span>
                  <span className="ml-auto text-xs text-slate-400 group-hover:text-indigo-500 transition-colors">Edit →</span>
                </div>
                {db?.contactName && (
                  <div className="text-xs text-slate-500 mt-1">
                    <span className="font-medium">Contact:</span> {db.contactName}
                    {db.contactPhone && <span className="ml-1 text-slate-400">· {db.contactPhone}</span>}
                  </div>
                )}
                {!db?.contactName && (
                  <div className="text-xs text-slate-300 italic">No contact info yet</div>
                )}
                {db?.notes && (
                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">{db.notes}</div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Custom partners */}
      {customDbPartners.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Custom Partners</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {customDbPartners.map((partner) => (
              <button
                key={partner.id}
                onClick={() => openEditModal(partner)}
                className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="w-5 h-5 rounded-md flex-shrink-0"
                    style={{ background: partner.color }}
                  />
                  <span className="font-semibold text-slate-800 text-sm">{partner.label}</span>
                  <span className="text-xs text-slate-400 font-mono ml-1">{partner.key}</span>
                  <span className="ml-auto text-xs text-slate-400 group-hover:text-indigo-500 transition-colors">Edit →</span>
                </div>
                {partner.contactName && (
                  <div className="text-xs text-slate-500 mt-1">
                    <span className="font-medium">Contact:</span> {partner.contactName}
                    {partner.contactPhone && <span className="ml-1 text-slate-400">· {partner.contactPhone}</span>}
                  </div>
                )}
                {partner.notes && (
                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">{partner.notes}</div>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Edit Modal */}
      {editingPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setEditingPartner(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-md" style={{ background: editForm.color }} />
                <h2 className="text-base font-bold text-slate-800">{editingPartner.label}</h2>
              </div>
              <button onClick={() => setEditingPartner(null)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Color</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditForm((f) => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-md transition-transform ${editForm.color === c ? "ring-2 ring-offset-1 ring-slate-400 scale-110" : "hover:scale-105"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Contact Name</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={editForm.contactName}
                  onChange={(e) => setEditForm((f) => ({ ...f, contactName: e.target.value }))}
                  placeholder="e.g. Priya Sharma"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Contact Phone</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={editForm.contactPhone}
                  onChange={(e) => setEditForm((f) => ({ ...f, contactPhone: e.target.value }))}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  rows={3}
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Programme focus, working areas, special notes…"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleEditSave}
                  disabled={editSaving}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                >
                  {editSaving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditingPartner(null)}
                  className="flex-1 border border-slate-200 rounded-lg py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Partner Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">Add Partner</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {addError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">{addError}</div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Partner Name *</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={addForm.label}
                  onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Navodaya"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Key (unique slug) *</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={addForm.key}
                  onChange={(e) => setAddForm((f) => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                  placeholder="e.g. navodaya"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Color</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setAddForm((f) => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-md transition-transform ${addForm.color === c ? "ring-2 ring-offset-1 ring-slate-400 scale-110" : "hover:scale-105"}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Contact Name</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={addForm.contactName}
                  onChange={(e) => setAddForm((f) => ({ ...f, contactName: e.target.value }))}
                  placeholder="e.g. Priya Sharma"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Contact Phone</label>
                <input
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={addForm.contactPhone}
                  onChange={(e) => setAddForm((f) => ({ ...f, contactPhone: e.target.value }))}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  rows={2}
                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Programme focus, working areas…"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAddSave}
                  disabled={addSaving || !addForm.label.trim() || !addForm.key.trim()}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                >
                  {addSaving ? "Saving…" : "Add Partner"}
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 border border-slate-200 rounded-lg py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
