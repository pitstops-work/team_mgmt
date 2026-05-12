'use client';

import { useState, useEffect } from 'react';

const STAGES = [
  'org-profile', 'governing-body', 'compliance', 'statutory-filings',
  'salary', 'funding', 'expenditure', 'pdd',
];

type Org = {
  id: string; name: string; city: string;
  created_at: string; completed_stages: string[];
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
    <div className="max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Due Diligence</h1>
          <p className="text-sm text-stone-500 mt-0.5">Progressive org data collection — profile, compliance, financials, programme design</p>
        </div>
        <button
          className="bg-sky-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors shrink-0"
          onClick={() => setShowForm(s => !s)}
        >
          {showForm ? 'Cancel' : '+ New org'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-stone-200 rounded-xl p-4 mb-4 flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-xs text-stone-500 font-medium">Organisation name</label>
            <input
              className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400"
              placeholder="Deepti Foundation"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createOrg()}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-32">
            <label className="text-xs text-stone-500 font-medium">City</label>
            <input
              className="border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400"
              placeholder="Bangalore"
              value={newCity}
              onChange={e => setNewCity(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createOrg()}
            />
          </div>
          <button
            className="bg-sky-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50"
            onClick={createOrg}
            disabled={saving || !newName.trim()}
          >
            {saving ? 'Creating…' : 'Create & open →'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-stone-400 text-sm">Loading…</div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-20 text-stone-400 text-sm">No organisations yet. Add one above.</div>
      ) : (
        <div className="grid gap-2">
          {orgs.map(org => {
            const done = org.completed_stages?.length ?? 0;
            const pct = Math.round((done / STAGES.length) * 100);
            return (
              <a key={org.id} href={`/due-diligence/${org.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 bg-white border border-stone-200 rounded-xl hover:border-sky-300 hover:shadow-sm transition-all no-underline">
                <div className="min-w-0">
                  <div className="font-medium text-stone-900">{org.name}</div>
                  {org.city && <div className="text-xs text-stone-500 mt-0.5">{org.city}</div>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <div className="w-24 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-stone-400 font-mono">{done}/{STAGES.length} stages</div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
