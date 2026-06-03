"use client";

/**
 * EditAPModal — edit title/detail/dueDate/priority/partnerStaffLabel of an
 * existing open ActionPoint. Posts PATCH /api/action-points/[id].
 */

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import type { ActionPoint, APPriority } from "./types";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

function ymdFromIso(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function EditAPModal({
  ap, onClose, onSaved,
}: {
  ap: ActionPoint;
  onClose: () => void;
  onSaved: (next: ActionPoint) => void;
}) {
  const [title, setTitle]   = useState(ap.title);
  const [detail, setDetail] = useState(ap.detail ?? "");
  const [dueYmd, setDueYmd] = useState(ymdFromIso(ap.dueDate));
  const [priority, setPriority] = useState<APPriority>(ap.priority);
  const [partner, setPartner]   = useState(ap.partnerStaffLabel ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setErr("Title is required"); return; }
    setSubmitting(true);
    setErr(null);
    const res = await fetch(`/api/action-points/${ap.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        detail: detail.trim() || null,
        dueDate: new Date(`${dueYmd}T00:00:00`).toISOString(),
        priority,
        partnerStaffLabel: partner.trim() || null,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({})))?.error ?? "Couldn't save");
      return;
    }
    onSaved(await res.json());
  }

  return (
    <SurfaceProvider id="action_point.edit_modal">
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-stone-900">Edit action point</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-4 h-4 text-stone-400" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Title <span className="text-red-400">*</span></label>
            <input
              autoFocus value={title} onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Detail</label>
            <textarea
              value={detail} onChange={e => setDetail(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-stone-600 mb-1">Due date</label>
              <input
                type="date" value={dueYmd} onChange={e => setDueYmd(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Priority</label>
              <button
                type="button"
                onClick={() => setPriority(p => p === "urgent" ? "routine" : "urgent")}
                className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors flex items-center gap-1 ${
                  priority === "urgent"
                    ? "bg-red-100 text-red-700 border-red-200 hover:bg-red-200"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                }`}
              >
                {priority === "urgent" && <AlertTriangle className="w-3.5 h-3.5" />}
                {priority === "urgent" ? "Urgent" : "Routine"}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Delegated to (optional)</label>
            <input
              value={partner} onChange={e => setPartner(e.target.value)}
              placeholder="e.g. Creche supervisor"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg">Cancel</button>
            <button type="button" onClick={submit} disabled={submitting}
              className="px-3 py-2 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-50 rounded-lg">
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </SurfaceProvider>
  );
}
