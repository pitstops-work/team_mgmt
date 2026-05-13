'use client';

import Link from 'next/link';

export default function AdminPage() {
  return (
    <div className="max-w-xl mx-auto px-6 py-8 sm:py-14">
      <div style={{ fontSize: 11, letterSpacing: 2, color: '#888', fontFamily: 'JetBrains Mono, monospace', marginBottom: 8 }}>ADMIN</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A1A', marginBottom: 6 }}>Review Portal</h1>
      <p style={{ fontSize: 14, color: '#777', marginBottom: 40 }}>Configuration and content management</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link href="/grant-notes/admin/rulebook" style={{
          display: 'block', padding: '20px 24px',
          border: '1px solid #D4D4CC', borderRadius: 8,
          textDecoration: 'none', background: '#FAFAF7',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginBottom: 4 }}>Rulebook</div>
          <div style={{ fontSize: 13, color: '#777' }}>Edit language rules, financial rules, document type templates and export modes</div>
        </Link>

        <Link href="/grant-notes/notes" style={{
          display: 'block', padding: '20px 24px',
          border: '1px solid #D4D4CC', borderRadius: 8,
          textDecoration: 'none', background: '#FAFAF7',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginBottom: 4 }}>Grant Notes</div>
          <div style={{ fontSize: 13, color: '#777' }}>View and manage all grant notes and programme design documents</div>
        </Link>

        <Link href="/grant-notes/draft" style={{
          display: 'block', padding: '20px 24px',
          border: '1px solid #D4D4CC', borderRadius: 8,
          textDecoration: 'none', background: '#FAFAF7',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', marginBottom: 4 }}>Draft new document</div>
          <div style={{ fontSize: 13, color: '#777' }}>Upload source documents and generate a new draft via Claude</div>
        </Link>
      </div>
    </div>
  );
}
