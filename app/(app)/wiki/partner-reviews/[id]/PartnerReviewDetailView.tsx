"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Save, Handshake, FileText } from "lucide-react";

type User = { id: string; name: string | null; image: string | null };
type LinkedPage = { id: string; slug: string; title: string; status: string };
type Meeting = {
  id: string;
  scheduledFor: string;
  completedAt: string | null;
  practiceChangesNoted: string | null;
  notes: string | null;
  language: string;
  partnerOrg: { id: string; name: string };
  attendees: User[];
  linkedPages: LinkedPage[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PartnerReviewDetailView({
  meeting,
  canModify,
}: {
  meeting: Meeting;
  canModify: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const [practiceChangesNoted, setPracticeChangesNoted] = useState(meeting.practiceChangesNoted ?? "");
  const [saving, setSaving] = useState(false);

  async function save(opts: { markCompleted?: boolean } = {}) {
    setSaving(true);
    const res = await fetch(`/api/wiki/partner-reviews/${meeting.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes,
        practiceChangesNoted,
        ...(opts.markCompleted ? { markCompleted: true } : {}),
      }),
    });
    setSaving(false);
    if (res.ok) router.refresh();
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/wiki/partner-reviews" className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Partner reviews
        </Link>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Handshake className="w-4 h-4 text-stone-500" />
            <span className="text-xs uppercase tracking-wide text-stone-500">Partner review</span>
            {meeting.completedAt ? (
              <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Completed {fmtDate(meeting.completedAt)}
              </span>
            ) : (
              <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">Scheduled</span>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-stone-900">{meeting.partnerOrg.name}</h1>
          <div className="mt-2 text-sm text-stone-500">Scheduled: {fmtDate(meeting.scheduledFor)}</div>
        </header>

        <section className="bg-white border border-stone-200 rounded-lg p-4 mb-4">
          <h2 className="text-sm font-semibold text-stone-800 mb-2 inline-flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-stone-500" />
            Practice changes noted
          </h2>
          <textarea
            value={practiceChangesNoted}
            onChange={(e) => setPracticeChangesNoted(e.target.value)}
            disabled={!canModify}
            rows={4}
            placeholder={canModify ? "What changes to shared practice did this surface?" : "Nothing noted."}
            className="w-full px-3 py-2 border border-stone-300 rounded text-sm disabled:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400"
          />

          <label className="block text-xs uppercase tracking-wide text-stone-500 mt-3 mb-1">
            General notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canModify}
            rows={3}
            className="w-full px-3 py-2 border border-stone-300 rounded text-sm disabled:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400"
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
              {!meeting.completedAt && (
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
              Attendees ({meeting.attendees.length})
            </h2>
            {meeting.attendees.length === 0 ? (
              <p className="text-xs text-stone-500">None.</p>
            ) : (
              <ul className="space-y-1">
                {meeting.attendees.map((a) => (
                  <li key={a.id} className="text-sm text-stone-700">{a.name}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-stone-800 mb-2">
              Linked pages ({meeting.linkedPages.length})
            </h2>
            {meeting.linkedPages.length === 0 ? (
              <p className="text-xs text-stone-500">None.</p>
            ) : (
              <ul className="space-y-1">
                {meeting.linkedPages.map((p) => (
                  <li key={p.id}>
                    <Link href={`/wiki/${p.slug}`} className="text-sm text-sky-700 hover:underline">
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
