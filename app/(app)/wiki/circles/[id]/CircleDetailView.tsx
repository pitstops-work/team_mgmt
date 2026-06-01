"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Save, Users, FileText, Trash2 } from "lucide-react";

type User = { id: string; name: string | null; image: string | null };
type LinkedPage = { id: string; slug: string; title: string; status: string };
type Circle = {
  id: string;
  scheduledFor: string;
  completedAt: string | null;
  vertical: string | null;
  caseDiscussed: string | null;
  notes: string | null;
  recordingUrl: string | null;
  language: string;
  facilitator: User;
  zone: { id: string; name: string } | null;
  attendees: User[];
  linkedPages: LinkedPage[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CircleDetailView({
  circle,
  canModify,
  verticalLabel,
}: {
  circle: Circle;
  canModify: boolean;
  verticalLabel: string | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(circle.notes ?? "");
  const [recordingUrl, setRecordingUrl] = useState(circle.recordingUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  async function archive() {
    if (archiving) return;
    if (!confirm(`Archive this circle (${fmtDate(circle.scheduledFor)})? It will disappear from lists and dashboards. Linked review prompts and attendees are preserved.`)) return;
    setArchiving(true);
    const res = await fetch(`/api/wiki/circles/${circle.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Archive failed");
      setArchiving(false);
      return;
    }
    router.push("/wiki/circles");
  }

  async function save(opts: { markCompleted?: boolean } = {}) {
    setSaving(true);
    const res = await fetch(`/api/wiki/circles/${circle.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes,
        recordingUrl,
        ...(opts.markCompleted ? { markCompleted: true } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) router.refresh();
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/wiki/circles" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Circles
        </Link>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-stone-500" />
            <span className="text-xs uppercase tracking-wide text-stone-500">Practice circle</span>
            {circle.completedAt ? (
              <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Completed {fmtDate(circle.completedAt)}
              </span>
            ) : (
              <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Scheduled</span>
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold text-stone-900">{fmtDate(circle.scheduledFor)}</h1>
            {canModify && (
              <button
                type="button"
                onClick={archive}
                disabled={archiving}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-stone-300 rounded-md text-xs text-stone-600 hover:border-red-400 hover:text-red-700 disabled:opacity-50"
                title="Archive circle (facilitator / steward only)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {archiving ? "Archiving…" : "Archive"}
              </button>
            )}
          </div>
          <div className="mt-2 text-sm text-stone-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>Facilitator: {circle.facilitator.name}</span>
            {circle.zone && <span>Zone: {circle.zone.name}</span>}
            {circle.vertical && <span>Vertical: {verticalLabel ?? circle.vertical}</span>}
          </div>
        </header>

        {circle.caseDiscussed && (
          <section className="bg-white border border-stone-200 rounded-lg p-4 mb-4">
            <h2 className="text-xs uppercase tracking-wide text-stone-500 mb-1">Case</h2>
            <p className="text-sm text-stone-800 whitespace-pre-wrap">{circle.caseDiscussed}</p>
          </section>
        )}

        <section className="bg-white border border-stone-200 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-stone-800 mb-2 inline-flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-stone-500" />
            Notes
          </h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canModify}
            rows={5}
            placeholder={canModify ? "What was decided? What's next?" : "No notes yet."}
            className="w-full px-3 py-2 border border-stone-300 rounded text-sm disabled:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400"
          />

          <label className="block text-xs uppercase tracking-wide text-stone-500 mt-3 mb-1">
            Recording URL (optional)
          </label>
          <input
            type="url"
            value={recordingUrl}
            onChange={(e) => setRecordingUrl(e.target.value)}
            disabled={!canModify}
            placeholder="https://…"
            className="w-full px-3 py-2 border border-stone-300 rounded text-sm font-mono disabled:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400"
          />

          {canModify && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => save({})}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded text-sm text-stone-700 hover:border-stone-500 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              {!circle.completedAt && (
                <button
                  type="button"
                  onClick={() => save({ markCompleted: true })}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded text-sm hover:bg-emerald-800 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark completed
                </button>
              )}
            </div>
          )}
        </section>

        <section className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white border border-stone-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-stone-800 mb-2">
              Attendees ({circle.attendees.length})
            </h2>
            {circle.attendees.length === 0 ? (
              <p className="text-xs text-stone-500">None.</p>
            ) : (
              <ul className="space-y-1">
                {circle.attendees.map((a) => (
                  <li key={a.id} className="text-sm text-stone-700">{a.name}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-stone-800 mb-2">
              Linked pages ({circle.linkedPages.length})
            </h2>
            {circle.linkedPages.length === 0 ? (
              <p className="text-xs text-stone-500">None.</p>
            ) : (
              <ul className="space-y-1">
                {circle.linkedPages.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/wiki/${p.slug}`}
                      className="text-sm text-sky-700 hover:underline"
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
