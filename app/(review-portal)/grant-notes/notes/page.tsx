'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type GrantNote = {
  id: string; org_name: string; org_city: string; meeting: string;
  theme: string; grant_number: string; grant_amount: string;
  doc_type: string; status: string; submitted_by: string; created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  designing: 'In Design', submitted: 'Pending review',
  approved: 'Approved', rejected: 'Rejected',
};

const STATUS_COLOR: Record<string, string> = {
  designing: 'bg-sky-100 text-sky-700',
  submitted: 'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-700',
};

export default function NotesPage() {
  const [notes, setNotes] = useState<GrantNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/review/grant-notes')
      .then(r => r.json())
      .then(d => { setNotes(d.notes || []); setLoading(false); });
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Grant Notes</h1>
          <p className="text-sm text-stone-500 mt-0.5">Submitted for review</p>
        </div>
        <Link href="/grant-notes/draft"
          className="bg-sky-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors">
          + Draft new
        </Link>
      </div>

      {loading && (
        <div className="text-center py-20 text-stone-400 text-sm">Loading…</div>
      )}

      {!loading && notes.length === 0 && (
        <div className="text-center py-20">
          <p className="text-stone-400 text-sm">No grant notes submitted yet.</p>
          <Link href="/grant-notes/draft" className="mt-3 inline-block text-sky-600 text-sm hover:underline">
            Draft the first one →
          </Link>
        </div>
      )}

      {!loading && notes.length > 0 && (
        <div className="grid gap-2">
          {notes.map(n => (
            <Link
              key={n.id}
              href={n.status === 'designing' ? `/grant-notes/notes/${n.id}/design` : `/grant-notes/notes/${n.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 bg-white border border-stone-200 rounded-xl hover:border-sky-300 hover:shadow-sm transition-all"
            >
              <div className="min-w-0">
                <div className="font-medium text-stone-900 truncate">
                  {n.org_name}{n.org_city ? `, ${n.org_city}` : ''}
                </div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {n.doc_type === 'programme_design' ? 'Programme Design' : `${n.grant_number || ''} grant`}
                  {n.theme ? ` · ${n.theme}` : ''}
                  {n.grant_amount ? ` · ${n.grant_amount}` : ''}
                  {n.meeting ? ` · ${n.meeting}` : ''}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[n.status] || 'bg-stone-100 text-stone-600'}`}>
                  {STATUS_LABEL[n.status] || n.status}
                </span>
                <div className="text-xs text-stone-400">
                  {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                {n.submitted_by && <div className="text-xs text-stone-400">by {n.submitted_by}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
