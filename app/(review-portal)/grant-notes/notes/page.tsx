'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type GrantNote = {
  id: string;
  org_name: string;
  org_city: string;
  meeting: string;
  theme: string;
  grant_number: string;
  grant_amount: string;
  doc_type: string;
  status: string;
  submitted_by: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  designing: 'In Design',
  submitted: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
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
    <div className="notes-page">
      <div className="notes-header">
        <div className="notes-header-left">
          <div className="notes-title">Grant Notes</div>
          <div className="notes-subtitle">Submitted for review</div>
        </div>
        <div className="notes-header-right">
          <Link href="/grant-notes/draft" className="notes-btn-primary">+ Draft new</Link>
        </div>
      </div>

      {loading && <div className="notes-empty">Loading…</div>}

      {!loading && notes.length === 0 && (
        <div className="notes-empty">
          <div className="notes-empty-icon">◎</div>
          <div>No grant notes submitted yet.</div>
          <div className="notes-empty-hint">
            <Link href="/grant-notes/draft">Draft the first one →</Link>
          </div>
        </div>
      )}

      {!loading && notes.length > 0 && (
        <div className="notes-list">
          {notes.map(n => (
            <Link key={n.id} href={n.status === 'designing' ? `/notes/${n.id}/design` : `/notes/${n.id}`} className="note-row">
              <div className="note-row-main">
                <div className="note-row-org">{n.org_name}{n.org_city ? `, ${n.org_city}` : ''}</div>
                <div className="note-row-meta">
                  {n.doc_type === 'programme_design' ? 'Programme Design' : `${n.grant_number || ''} grant`}
                  {n.theme ? ` · ${n.theme}` : ''}
                  {n.grant_amount ? ` · ${n.grant_amount}` : ''}
                </div>
                {n.meeting && <div className="note-row-meeting">{n.meeting}</div>}
              </div>
              <div className="note-row-right">
                <span className={`status-badge status-${n.status}`}>{STATUS_LABEL[n.status] || n.status}</span>
                <div className="note-row-date">{new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                {n.submitted_by && <div className="note-row-by">by {n.submitted_by}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
