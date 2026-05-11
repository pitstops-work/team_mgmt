'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const SECTIONS = [
  { key: 'financial', label: 'Financial Rules' },
  { key: 'language', label: 'Language Rules' },
  { key: 'template', label: 'Template Structure (Grant Note default)' },
  { key: 'cost_norms', label: 'Cost Norms' },
];

type DocType = {
  key: string;
  label: string;
  template_rules: string;
  export_mode: string;
  apply_financial_rules: boolean;
};

export default function RulebookPage() {
  const [passphrase, setPassphrase] = useState('');
  const [tab, setTab] = useState<'rules' | 'doctypes'>('rules');

  // Shared rules tab
  const [content, setContent] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Doc types tab
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [dtLoaded, setDtLoaded] = useState(false);
  const [dtSaving, setDtSaving] = useState<string | null>(null);
  const [dtSaved, setDtSaved] = useState<string | null>(null);
  const [dtError, setDtError] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    fetch('/api/review/review/rulebook')
      .then(r => r.json())
      .then(d => { setContent(d); setLoaded(true); });
    fetch('/api/review/review/doc-types')
      .then(r => r.json())
      .then(d => { setDocTypes(d.doc_types || []); setDtLoaded(true); });
  }, []);

  const save = async (section: string) => {
    if (!passphrase) { setError('Enter admin passphrase first'); return; }
    setSaving(section);
    setError('');
    const res = await fetch('/api/review/review/rulebook', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-passphrase': passphrase },
      body: JSON.stringify({ section, content: content[section] }),
    });
    setSaving(null);
    if (!res.ok) { setError('Wrong passphrase or save failed'); return; }
    setSaved(section);
    setTimeout(() => setSaved(null), 2000);
  };

  const reset = async (section: string) => {
    if (!passphrase) { setError('Enter admin passphrase first'); return; }
    if (!confirm(`Reset "${SECTIONS.find(s => s.key === section)?.label}" to default?`)) return;
    setSaving(section);
    await fetch('/api/review/review/rulebook', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-admin-passphrase': passphrase },
      body: JSON.stringify({ section, content: null }),
    });
    setSaving(null);
    fetch('/api/review/review/rulebook').then(r => r.json()).then(d => setContent(d));
  };

  const updateDt = (key: string, field: keyof DocType, value: any) => {
    setDocTypes(prev => prev.map(dt => dt.key === key ? { ...dt, [field]: value } : dt));
  };

  const saveDt = async (key: string) => {
    if (!passphrase) { setDtError('Enter admin passphrase first'); return; }
    setDtSaving(key);
    setDtError('');
    const dt = docTypes.find(d => d.key === key);
    if (!dt) return;
    const res = await fetch('/api/review/review/doc-types', {
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
    const res = await fetch('/api/review/review/doc-types', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-passphrase': passphrase },
      body: JSON.stringify({ key, label: newLabel }),
    });
    if (!res.ok) { setDtError('Failed to create doc type'); return; }
    setNewKey(''); setNewLabel('');
    fetch('/api/review/review/doc-types').then(r => r.json()).then(d => setDocTypes(d.doc_types || []));
  };

  const deleteDt = async (key: string, label: string) => {
    if (!passphrase) { setDtError('Enter admin passphrase first'); return; }
    if (!confirm(`Delete document type "${label}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/review/review/doc-types?key=${encodeURIComponent(key)}`, {
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
          <div className="rulebook-subtitle">Controls what Claude follows when drafting and how Word exports are formatted</div>
        </div>
        <Link href="/review/admin" className="rulebook-back">← Admin</Link>
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
          className={`rulebook-tab${tab === 'rules' ? ' active' : ''}`}
          onClick={() => setTab('rules')}
        >
          Shared Rules
        </button>
        <button
          className={`rulebook-tab${tab === 'doctypes' ? ' active' : ''}`}
          onClick={() => setTab('doctypes')}
        >
          Document Types
        </button>
      </div>

      {tab === 'rules' && (
        <>
          {error && <div className="rulebook-error">{error}</div>}
          {!loaded && <div className="rulebook-loading">Loading…</div>}
          {loaded && SECTIONS.map(({ key, label }) => (
            <div key={key} className="rulebook-section">
              <div className="rulebook-section-header">
                <div className="rulebook-section-title">{label}</div>
                <div className="rulebook-section-actions">
                  <button className="rulebook-btn-reset" onClick={() => reset(key)}>Reset to default</button>
                  <button
                    className="rulebook-btn-save"
                    onClick={() => save(key)}
                    disabled={saving === key}
                  >
                    {saving === key ? 'Saving…' : saved === key ? 'Saved ✓' : 'Save'}
                  </button>
                </div>
              </div>
              <textarea
                className="rulebook-textarea"
                value={content[key] || ''}
                onChange={e => setContent(prev => ({ ...prev, [key]: e.target.value }))}
                rows={12}
                spellCheck={false}
              />
            </div>
          ))}
        </>
      )}

      {tab === 'doctypes' && (
        <>
          {dtError && <div className="rulebook-error">{dtError}</div>}
          {!dtLoaded && <div className="rulebook-loading">Loading…</div>}
          <div className="rulebook-dt-hint">
            Each document type has its own template structure that Claude follows. Language rules apply to all types.
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
                  <span>Apply financial rules (opex, dependency, budget categories) when drafting</span>
                </label>
              </div>

              <div className="rulebook-dt-label">Template structure (Claude follows this when drafting)</div>
              <textarea
                className="rulebook-textarea"
                value={dt.template_rules}
                onChange={e => updateDt(dt.key, 'template_rules', e.target.value)}
                rows={14}
                spellCheck={false}
                placeholder="Describe the template structure Claude should follow for this document type…"
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
    </div>
  );
}
