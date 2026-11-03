'use client';

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import PartnerPicker from '@/components/partners/PartnerPicker';

const STAGES = [
  'org-profile', 'governing-body', 'compliance', 'statutory-filings',
  'salary', 'funding', 'expenditure', 'pdd',
];

type Org = {
  id: string; name: string; city: string;
  created_at: string; completed_stages: string[];
  /** Org.id in the shared partner registry. Null only for pre-registry rows. */
  app_org_id: string | null;
};

export default function DueDiligenceListPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [pickedOrgId, setPickedOrgId] = useState('');
  const [saving, setSaving] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch('/api/review/orgs')
      .then(r => r.json())
      .then(data => { setOrgs(data); setLoading(false); });
  }, []);

  // The partner is chosen from the shared registry, never typed here: this
  // table used to be its own registry and filled up with "Demo" / "Test" rows
  // while the eighteen partners that actually hold budgets were missing.
  async function createOrg() {
    if (!pickedOrgId) return;
    setSaving(true);
    setCreateErr(null);
    try {
      const res = await fetch('/api/review/orgs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appOrgId: pickedOrgId }),
      });
      const org = await res.json();
      if (!res.ok) throw new Error(org?.error ?? 'Could not open that partner');
      window.location.href = `/due-diligence/${org.id}`;
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Could not open that partner');
      setSaving(false);
    }
  }

  async function deleteOrg(orgId: string) {
    setDeleting(true);
    await fetch(`/api/review/orgs/${orgId}`, { method: 'DELETE' });
    setOrgs(prev => prev.filter(o => o.id !== orgId));
    setConfirmDeleteId(null);
    setDeleting(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
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
          <div className="flex flex-col gap-1 flex-1 min-w-48">
            <label className="text-xs text-stone-500 font-medium">Partner</label>
            <PartnerPicker
              value={pickedOrgId}
              onChange={(id) => setPickedOrgId(id)}
              autoFocus
            />
            <p className="text-xs text-stone-400">
              Shared with the budget and review portals — the same partner everywhere.
            </p>
            {createErr && <div className="text-xs text-red-600">{createErr}</div>}
          </div>
          <button
            className="bg-sky-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50"
            onClick={createOrg}
            disabled={saving || !pickedOrgId}
          >
            {saving ? 'Opening…' : 'Open →'}
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
            const isConfirming = confirmDeleteId === org.id;
            return (
              <div key={org.id} className="relative group">
                {isConfirming ? (
                  <div className="flex items-center justify-between gap-4 px-5 py-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="text-sm text-red-700 min-w-0">
                      <span className="font-medium">Delete {org.name}?</span>
                      <span className="text-red-500 ml-2 text-xs">All DD data will be permanently removed.</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        className="text-xs text-stone-500 hover:text-stone-800 px-3 py-1.5 rounded-lg border border-stone-200 bg-white"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deleting}
                      >
                        Cancel
                      </button>
                      <button
                        className="text-xs text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
                        onClick={() => deleteOrg(org.id)}
                        disabled={deleting}
                      >
                        {deleting ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <a href={`/due-diligence/${org.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 bg-white border border-stone-200 rounded-xl hover:border-sky-300 hover:shadow-sm transition-all no-underline flex-1 min-w-0">
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
                    <button
                      className="p-2 text-stone-300 hover:text-red-500 transition-colors shrink-0"
                      onClick={() => setConfirmDeleteId(org.id)}
                      title="Delete org"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
