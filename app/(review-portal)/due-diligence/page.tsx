'use client';

import { useState, useEffect } from 'react';

const STAGES = [
  'org-profile', 'governing-body', 'compliance', 'statutory-filings',
  'salary', 'funding', 'expenditure', 'pdd',
];

type Org = {
  id: string;
  name: string;
  city: string;
  created_at: string;
  completed_stages: string[];
};

export default function DueDiligenceListPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/review/orgs')
      .then(r => r.json())
      .then(data => { setOrgs(data); setLoading(false); });
  }, []);

  async function createOrg() {
    if (!newName.trim()) return;
    setSaving(true);
    const res = await fetch('/api/review/orgs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), city: newCity.trim() }),
    });
    const org = await res.json();
    setSaving(false);
    window.location.href = `/due-diligence/${org.id}`;
  }

  return (
    <div className="dd-list-page">
      <div className="dd-list-header">
        <div>
          <div className="dd-list-title">Due Diligence</div>
          <div className="dd-list-hint">Progressive org data collection — org profile, compliance, financials, programme design</div>
        </div>
        <button className="dd-list-new-btn" onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : '+ New org'}
        </button>
      </div>

      {showForm && (
        <div className="dd-new-form">
          <input
            className="dd-new-input"
            placeholder="Organisation name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createOrg()}
            autoFocus
          />
          <input
            className="dd-new-input"
            placeholder="City (optional)"
            value={newCity}
            onChange={e => setNewCity(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createOrg()}
          />
          <button className="dd-new-submit" onClick={createOrg} disabled={saving || !newName.trim()}>
            {saving ? 'Creating…' : 'Create & open →'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="dd-list-empty">Loading…</div>
      ) : orgs.length === 0 ? (
        <div className="dd-list-empty">No organisations yet. Add one above.</div>
      ) : (
        <div className="dd-org-list">
          {orgs.map(org => {
            const done = org.completed_stages?.length ?? 0;
            const pct = Math.round((done / STAGES.length) * 100);
            return (
              <a key={org.id} href={`/due-diligence/${org.id}`} className="dd-org-card">
                <div className="dd-org-card-main">
                  <div className="dd-org-name">{org.name}</div>
                  {org.city && <div className="dd-org-city">{org.city}</div>}
                </div>
                <div className="dd-org-card-right">
                  <div className="dd-org-progress-bar">
                    <div className="dd-org-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="dd-org-progress-label">{done}/{STAGES.length} stages</div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
