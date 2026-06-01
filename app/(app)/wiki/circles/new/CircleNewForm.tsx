"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";

type U = { id: string; name: string | null; email: string };
type Z = { id: string; name: string };
type P = { id: string; slug: string; title: string };
type ND = { domain: string; label: string };

export default function CircleNewForm({
  users,
  zones,
  pages,
  needsDomains,
  defaultFacilitatorId,
}: {
  users: U[];
  zones: Z[];
  pages: P[];
  needsDomains: ND[];
  defaultFacilitatorId: string;
}) {
  const router = useRouter();
  const [scheduledFor, setScheduledFor] = useState(new Date().toISOString().slice(0, 10));
  const [facilitatorId, setFacilitatorId] = useState(defaultFacilitatorId);
  const [vertical, setVertical] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [caseDiscussed, setCaseDiscussed] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [linkedPageIds, setLinkedPageIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/wiki/circles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduledFor: new Date(scheduledFor).toISOString(),
        facilitatorId,
        vertical: vertical.trim() || null,
        zoneId: zoneId || null,
        caseDiscussed: caseDiscussed.trim() || null,
        attendeeIds,
        linkedPageIds,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Create failed");
      setSaving(false);
      return;
    }
    const data = await res.json();
    router.push(`/wiki/circles/${data.circle.id}`);
  }

  function toggle(list: string[], setList: (l: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-xl mx-auto px-4 py-6">
        <Link href="/wiki/circles" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Circles
        </Link>
        <h1 className="text-2xl font-semibold text-stone-900 mb-6">Schedule practice circle</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Date</label>
            <input
              type="date"
              required
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Facilitator</label>
            <select
              value={facilitatorId}
              onChange={(e) => setFacilitatorId(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Zone (optional)</label>
              <select
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              >
                <option value="">—</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Vertical (optional)</label>
              <select
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              >
                <option value="">—</option>
                {needsDomains.map((d) => (
                  <option key={d.domain} value={d.domain}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Case to discuss</label>
            <textarea
              value={caseDiscussed}
              onChange={(e) => setCaseDiscussed(e.target.value)}
              rows={2}
              placeholder="One-line note about what the circle is for…"
              className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Attendees ({attendeeIds.length})
            </label>
            <div className="max-h-40 overflow-y-auto border border-stone-200 rounded-md bg-white">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={attendeeIds.includes(u.id)}
                    onChange={() => toggle(attendeeIds, setAttendeeIds, u.id)}
                  />
                  {u.name ?? u.email}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Linked pages ({linkedPageIds.length})
            </label>
            <p className="text-xs text-stone-500 mb-1">
              Owners of these pages get a "review within 7 days" prompt once you mark the circle completed.
            </p>
            <div className="max-h-40 overflow-y-auto border border-stone-200 rounded-md bg-white">
              {pages.length === 0 ? (
                <p className="text-xs text-stone-500 px-3 py-2">No wiki pages yet.</p>
              ) : (
                pages.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={linkedPageIds.includes(p.id)}
                      onChange={() => toggle(linkedPageIds, setLinkedPageIds, p.id)}
                    />
                    {p.title}
                  </label>
                ))
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link href="/wiki/circles" className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900">Cancel</Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {saving ? "Scheduling…" : "Schedule"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
