'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Capability = {
  id: string;
  label: string;
  category: string;
  description: string;
  prompt_fragment: string;
  config_json: Record<string, unknown>;
  built_in: boolean;
  archived_at: string | null;
  updated_at: string;
};

type DocType = {
  key: string;
  label: string;
  template_rules: string;
  export_mode: string;
  apply_financial_rules: boolean;
};

const CATEGORIES: string[] = [
  'language', 'financial', 'structure', 'format', 'cost', 'compliance', 'custom',
];

type PromotionCandidate = {
  normalized: string;
  count: number;
  sample_instruction: string;
  last_used: string;
  common_scope: string[];
};

export default function RulebookPage() {
  const [passphrase, setPassphrase] = useState('');
  const [tab, setTab] = useState<'capabilities' | 'doctypes' | 'promote'>('capabilities');

  // Capabilities tab
  const [caps, setCaps] = useState<Capability[]>([]);
  const [capsLoaded, setCapsLoaded] = useState(false);
  const [capSaving, setCapSaving] = useState<string | null>(null);
  const [capSaved, setCapSaved] = useState<string | null>(null);
  const [capError, setCapError] = useState('');
  const [newCap, setNewCap] = useState({
    id: '', label: '', category: 'custom', description: '', prompt_fragment: '',
  });

  // Doc types tab
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [dtLoaded, setDtLoaded] = useState(false);
  const [dtSaving, setDtSaving] = useState<string | null>(null);
  const [dtSaved, setDtSaved] = useState<string | null>(null);
  const [dtError, setDtError] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');

  // Promotion tab
  const [candidates, setCandidates] = useState<PromotionCandidate[]>([]);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [promoteError, setPromoteError] = useState('');
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteForm, setPromoteForm] = useState<Record<string, { id: string; label: string; category: string; prompt_fragment: string }>>({});

  const reloadCaps = () =>
    fetch('/api/review/capabilities')
      .then(r => r.json())
      .then(d => { setCaps(d.capabilities || []); setCapsLoaded(true); });

  const reloadCandidates = () =>
    fetch('/api/review/promotion-candidates')
      .then(r => r.json())
      .then(d => { setCandidates(d.candidates || []); setCandidatesLoaded(true); });

  useEffect(() => {
    reloadCaps();
    fetch('/api/review/doc-types')
      .then(r => r.json())
      .then(d => { setDocTypes(d.doc_types || []); setDtLoaded(true); });
    reloadCandidates();
  }, []);

  const updateCapField = (id: string, field: keyof Capability, value: any) => {
    setCaps(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const saveCap = async (cap: Capability) => {
    if (!passphrase) { setCapError('Enter admin passphrase first'); return; }
    setCapSaving(cap.id);
    setCapError('');
    const res = await fetch('/api/review/capabilities', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-passphrase': passphrase },
      body: JSON.stringify({
        id: cap.id,
        label: cap.label,
        description: cap.description,
        prompt_fragment: cap.prompt_fragment,
        config_json: cap.config_json,
      }),
    });
    setCapSaving(null);
    if (!res.ok) { setCapError('Wrong passphrase or save failed'); return; }
    setCapSaved(cap.id);
    setTimeout(() => setCapSaved(null), 2000);
  };

  const archiveCap = async (cap: Capability) => {
    if (!passphrase) { setCapError('Enter admin passphrase first'); return; }
    if (!confirm(`Archive capability "${cap.label}"? Drafts in progress won't use it.`)) return;
    const res = await fetch(`/api/review/capabilities?id=${encodeURIComponent(cap.id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-passphrase': passphrase },
    });
    if (!res.ok) { setCapError('Cannot archive — built-in capabilities are protected.'); return; }
    setCaps(prev => prev.filter(c => c.id !== cap.id));
  };

  const createCap = async () => {
    if (!passphrase) { setCapError('Enter admin passphrase first'); return; }
    if (!newCap.id || !newCap.label || !newCap.description || !newCap.prompt_fragment) {
      setCapError('id, label, description, prompt_fragment required');
      return;
    }
    const res = await fetch('/api/review/capabilities', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-passphrase': passphrase },
      body: JSON.stringify(newCap),
    });
    if (!res.ok) { setCapError('Create failed — id may already exist.'); return; }
    setNewCap({ id: '', label: '', category: 'custom', description: '', prompt_fragment: '' });
    reloadCaps();
  };

  // ── Doc type helpers (unchanged) ────────────────────────────────────────

  const updateDt = (key: string, field: keyof DocType, value: any) => {
    setDocTypes(prev => prev.map(dt => dt.key === key ? { ...dt, [field]: value } : dt));
  };

  const saveDt = async (key: string) => {
    if (!passphrase) { setDtError('Enter admin passphrase first'); return; }
    setDtSaving(key);
    setDtError('');
    const dt = docTypes.find(d => d.key === key);
    if (!dt) return;
    const res = await fetch('/api/review/doc-types', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-passphrase': passphrase },
      body: JSON.stringify({
        key: dt.key,
        label: dt.label,
        template_rules: dt.template_rules,
        export_mode: dt.export_mode,
        apply_financial_rules: dt.apply_financial_rules,
      }),
    });
    setDtSaving(null);
    if (!res.ok) { setDtError('Wrong passphrase or save failed'); return; }
    setDtSaved(key);
    setTimeout(() => setDtSaved(null), 2000);
  };

  const addDocType = async () => {
    if (!passphrase) { setDtError('Enter admin passphrase first'); return; }
    if (!newKey || !newLabel) { setDtError('Key and label required'); return; }
    const key = newKey.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const res = await fetch('/api/review/doc-types', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-passphrase': passphrase },
      body: JSON.stringify({ key, label: newLabel }),
    });
    if (!res.ok) { setDtError('Failed to create doc type'); return; }
    setNewKey(''); setNewLabel('');
    fetch('/api/review/doc-types').then(r => r.json()).then(d => setDocTypes(d.doc_types || []));
  };

  const deleteDt = async (key: string, label: string) => {
    if (!passphrase) { setDtError('Enter admin passphrase first'); return; }
    if (!confirm(`Delete document type "${label}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/review/doc-types?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { 'x-admin-passphrase': passphrase },
    });
    if (!res.ok) { setDtError('Cannot delete this doc type'); return; }
    setDocTypes(prev => prev.filter(d => d.key !== key));
  };

  return (
    <div className="admin-rulebook">
      <div className="rulebook-header">
        <div>
          <div className="rulebook-title">Rulebook</div>
          <div className="rulebook-subtitle">Capabilities and document types — controls what the AI follows when drafting and editing.</div>
        </div>
        <Link href="/grant-notes/admin" className="rulebook-back">← Admin</Link>
      </div>

      <div className="rulebook-passphrase">
        <label>Admin passphrase</label>
        <input
          type="password"
          placeholder="Required to save"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
        />
      </div>

      <div className="rulebook-tabs">
        <button
          className={`rulebook-tab${tab === 'capabilities' ? ' active' : ''}`}
          onClick={() => setTab('capabilities')}
        >
          Capabilities
        </button>
        <button
          className={`rulebook-tab${tab === 'doctypes' ? ' active' : ''}`}
          onClick={() => setTab('doctypes')}
        >
          Document Types
        </button>
        <button
          className={`rulebook-tab${tab === 'promote' ? ' active' : ''}`}
          onClick={() => setTab('promote')}
        >
          Promotion Candidates{candidates.length > 0 ? ` (${candidates.length})` : ''}
        </button>
      </div>

      {tab === 'capabilities' && (
        <>
          {capError && <div className="rulebook-error">{capError}</div>}
          {!capsLoaded && <div className="rulebook-loading">Loading…</div>}
          <div className="rulebook-dt-hint">
            Each capability is a composable rule the AI can apply. Built-in ones (language, financial, structure, format, cost, compliance) cannot be archived but the prompt and description are fully editable. Add custom capabilities below.
          </div>

          {capsLoaded && caps.map(cap => (
            <div key={cap.id} className="rulebook-section">
              <div className="rulebook-section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="rulebook-section-title">{cap.label}</div>
                  <code style={{ fontSize: 11, color: '#777', background: '#f4f4f0', padding: '2px 6px', borderRadius: 3 }}>{cap.id}</code>
                  <code style={{ fontSize: 11, color: '#555', background: '#eef', padding: '2px 6px', borderRadius: 3 }}>{cap.category}</code>
                  {cap.built_in && <span style={{ fontSize: 11, color: '#888' }}>built-in</span>}
                </div>
                <div className="rulebook-section-actions">
                  {!cap.built_in && (
                    <button className="rulebook-btn-reset" onClick={() => archiveCap(cap)}>Archive</button>
                  )}
                  <button
                    className="rulebook-btn-save"
                    onClick={() => saveCap(cap)}
                    disabled={capSaving === cap.id}
                  >
                    {capSaving === cap.id ? 'Saving…' : capSaved === cap.id ? 'Saved ✓' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="rulebook-dt-meta">
                <label className="rulebook-dt-field">
                  <span>Display label</span>
                  <input
                    type="text"
                    value={cap.label}
                    onChange={e => updateCapField(cap.id, 'label', e.target.value)}
                  />
                </label>
                <label className="rulebook-dt-field" style={{ gridColumn: '1 / -1' }}>
                  <span>Description (shown in scope picker)</span>
                  <input
                    type="text"
                    value={cap.description}
                    onChange={e => updateCapField(cap.id, 'description', e.target.value)}
                  />
                </label>
              </div>

              <div className="rulebook-dt-label">Prompt fragment (injected into AI system prompt when this capability is in scope)</div>
              <textarea
                className="rulebook-textarea"
                value={cap.prompt_fragment}
                onChange={e => updateCapField(cap.id, 'prompt_fragment', e.target.value)}
                rows={14}
                spellCheck={false}
              />
            </div>
          ))}

          <div className="rulebook-section rulebook-add-dt">
            <div className="rulebook-section-title">Add custom capability</div>
            <div className="rulebook-dt-meta">
              <label className="rulebook-dt-field">
                <span>Id (snake_case, e.g. language.active_voice)</span>
                <input
                  type="text"
                  value={newCap.id}
                  onChange={e => setNewCap(c => ({ ...c, id: e.target.value }))}
                  placeholder="custom.terse_executive_summary"
                />
              </label>
              <label className="rulebook-dt-field">
                <span>Label</span>
                <input
                  type="text"
                  value={newCap.label}
                  onChange={e => setNewCap(c => ({ ...c, label: e.target.value }))}
                  placeholder="Terse Exec Summary"
                />
              </label>
              <label className="rulebook-dt-field">
                <span>Category</span>
                <select
                  value={newCap.category}
                  onChange={e => setNewCap(c => ({ ...c, category: e.target.value }))}
                >
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </label>
              <label className="rulebook-dt-field" style={{ gridColumn: '1 / -1' }}>
                <span>Description</span>
                <input
                  type="text"
                  value={newCap.description}
                  onChange={e => setNewCap(c => ({ ...c, description: e.target.value }))}
                  placeholder="Keep executive summaries under 100 words"
                />
              </label>
            </div>
            <div className="rulebook-dt-label">Prompt fragment</div>
            <textarea
              className="rulebook-textarea"
              value={newCap.prompt_fragment}
              onChange={e => setNewCap(c => ({ ...c, prompt_fragment: e.target.value }))}
              rows={8}
              placeholder="Describe what the AI should do when this capability is active…"
              spellCheck={false}
            />
            <button className="rulebook-btn-save" onClick={createCap}>Create</button>
          </div>
        </>
      )}

      {tab === 'doctypes' && (
        <>
          {dtError && <div className="rulebook-error">{dtError}</div>}
          {!dtLoaded && <div className="rulebook-loading">Loading…</div>}
          <div className="rulebook-dt-hint">
            Each document type has its own template structure that the AI follows. Language and format capabilities apply to all types; financial + cost capabilities apply when <strong>Apply financial rules</strong> is on.
            Export mode controls the Word download format: <strong>structured</strong> uses the two-column grant-note table layout; <strong>freeflow</strong> renders each section as flowing prose with headings.
          </div>

          {dtLoaded && docTypes.map(dt => (
            <div key={dt.key} className="rulebook-section">
              <div className="rulebook-section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="rulebook-section-title">{dt.label}</div>
                  <code style={{ fontSize: 11, color: '#777', background: '#f4f4f0', padding: '2px 6px', borderRadius: 3 }}>{dt.key}</code>
                </div>
                <div className="rulebook-section-actions">
                  {!['grant_note', 'programme_design'].includes(dt.key) && (
                    <button className="rulebook-btn-reset" onClick={() => deleteDt(dt.key, dt.label)}>Delete</button>
                  )}
                  <button
                    className="rulebook-btn-save"
                    onClick={() => saveDt(dt.key)}
                    disabled={dtSaving === dt.key}
                  >
                    {dtSaving === dt.key ? 'Saving…' : dtSaved === dt.key ? 'Saved ✓' : 'Save'}
                  </button>
                </div>
              </div>

              <div className="rulebook-dt-meta">
                <label className="rulebook-dt-field">
                  <span>Display label</span>
                  <input
                    type="text"
                    value={dt.label}
                    onChange={e => updateDt(dt.key, 'label', e.target.value)}
                  />
                </label>
                <label className="rulebook-dt-field">
                  <span>Export mode</span>
                  <select value={dt.export_mode} onChange={e => updateDt(dt.key, 'export_mode', e.target.value)}>
                    <option value="structured">structured — two-column table (grant note style)</option>
                    <option value="freeflow">freeflow — flowing prose with headings</option>
                  </select>
                </label>
                <label className="rulebook-dt-field rulebook-dt-checkbox">
                  <input
                    type="checkbox"
                    checked={dt.apply_financial_rules}
                    onChange={e => updateDt(dt.key, 'apply_financial_rules', e.target.checked)}
                  />
                  <span>Apply financial + cost capabilities when drafting this doc type</span>
                </label>
              </div>

              <div className="rulebook-dt-label">Template structure (Claude follows this when drafting — overrides the structure capability for this doc type)</div>
              <textarea
                className="rulebook-textarea"
                value={dt.template_rules}
                onChange={e => updateDt(dt.key, 'template_rules', e.target.value)}
                rows={14}
                spellCheck={false}
                placeholder="Leave empty to use the global structure capability…"
              />
            </div>
          ))}

          <div className="rulebook-section rulebook-add-dt">
            <div className="rulebook-section-title">Add document type</div>
            <div className="rulebook-dt-meta">
              <label className="rulebook-dt-field">
                <span>Key (snake_case, e.g. field_report)</span>
                <input
                  type="text"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  placeholder="field_report"
                />
              </label>
              <label className="rulebook-dt-field">
                <span>Display label</span>
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="Field Report"
                />
              </label>
            </div>
            <button className="rulebook-btn-save" onClick={addDocType}>Create</button>
          </div>
        </>
      )}

      {tab === 'promote' && (
        <>
          {promoteError && <div className="rulebook-error">{promoteError}</div>}
          {!candidatesLoaded && <div className="rulebook-loading">Loading…</div>}
          <div className="rulebook-dt-hint">
            Patterns observed 3+ times across notes that haven't been promoted yet. Promoting creates a new capability from the instruction and marks the matching log rows as promoted (so they no longer show here).
          </div>

          {candidatesLoaded && candidates.length === 0 && (
            <div className="rulebook-section">
              <div className="rulebook-dt-hint">No promotion candidates yet. As you give the AI repeated instructions across notes, recurring patterns will surface here.</div>
            </div>
          )}

          {candidates.map(c => {
            const form = promoteForm[c.normalized] || {
              id: '',
              label: '',
              category: 'custom',
              prompt_fragment: '',
            };
            return (
              <div key={c.normalized} className="rulebook-section">
                <div className="rulebook-section-header">
                  <div>
                    <div className="rulebook-section-title">"{c.sample_instruction}"</div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>
                      Observed {c.count}× · last used {new Date(c.last_used).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {c.common_scope.length > 0 && <> · common scope: {c.common_scope.join(', ')}</>}
                    </div>
                  </div>
                </div>

                <div className="rulebook-dt-meta">
                  <label className="rulebook-dt-field">
                    <span>New capability id</span>
                    <input
                      type="text"
                      value={form.id}
                      onChange={e => setPromoteForm(prev => ({
                        ...prev,
                        [c.normalized]: { ...form, id: e.target.value },
                      }))}
                      placeholder="language.active_voice"
                    />
                  </label>
                  <label className="rulebook-dt-field">
                    <span>Label</span>
                    <input
                      type="text"
                      value={form.label}
                      onChange={e => setPromoteForm(prev => ({
                        ...prev,
                        [c.normalized]: { ...form, label: e.target.value },
                      }))}
                      placeholder="Active voice"
                    />
                  </label>
                  <label className="rulebook-dt-field">
                    <span>Category</span>
                    <select
                      value={form.category}
                      onChange={e => setPromoteForm(prev => ({
                        ...prev,
                        [c.normalized]: { ...form, category: e.target.value },
                      }))}
                    >
                      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </label>
                </div>

                <div className="rulebook-dt-label">Prompt fragment (will be the new capability's text)</div>
                <textarea
                  className="rulebook-textarea"
                  value={form.prompt_fragment}
                  onChange={e => setPromoteForm(prev => ({
                    ...prev,
                    [c.normalized]: { ...form, prompt_fragment: e.target.value },
                  }))}
                  rows={6}
                  placeholder={`Generalise the recurring instruction into a rule. e.g. "Always use active voice. Rewrite any passive construction. Never use 'is being', 'was being', etc."`}
                  spellCheck={false}
                />

                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button
                    className="rulebook-btn-save"
                    disabled={promoting === c.normalized}
                    onClick={async () => {
                      if (!passphrase) { setPromoteError('Enter admin passphrase first'); return; }
                      if (!form.id || !form.label || !form.prompt_fragment) {
                        setPromoteError('id, label, and prompt_fragment required'); return;
                      }
                      setPromoting(c.normalized);
                      setPromoteError('');

                      const createRes = await fetch('/api/review/capabilities', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', 'x-admin-passphrase': passphrase },
                        body: JSON.stringify({
                          id: form.id,
                          label: form.label,
                          category: form.category,
                          description: `Promoted from "${c.sample_instruction.slice(0, 80)}"`,
                          prompt_fragment: form.prompt_fragment,
                        }),
                      });
                      if (!createRes.ok) {
                        setPromoting(null);
                        setPromoteError('Capability creation failed — id may already exist.');
                        return;
                      }
                      const cd = await createRes.json();
                      const capId = cd.id || form.id;

                      const markRes = await fetch('/api/review/promotion-candidates', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', 'x-admin-passphrase': passphrase },
                        body: JSON.stringify({ normalized: c.normalized, capability_id: capId }),
                      });
                      if (!markRes.ok) {
                        setPromoting(null);
                        setPromoteError('Capability created but marking instruction_log failed.');
                        return;
                      }

                      setPromoting(null);
                      setPromoteForm(prev => { const next = { ...prev }; delete next[c.normalized]; return next; });
                      reloadCandidates();
                      reloadCaps();
                    }}
                  >
                    {promoting === c.normalized ? 'Promoting…' : 'Promote to capability'}
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
