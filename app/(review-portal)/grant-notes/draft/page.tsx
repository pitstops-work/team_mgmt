'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { upload } from '@vercel/blob/client';

// ─── Types ───────────────────────────────────────────────────────────────────

type FieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'budget_picker';
type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  group?: string;
  placeholder?: string;
  rows?: number;
  options?: string[];
  required?: boolean;
  budgetDomain?: string;
};

type BudgetOption = { id: string; name: string; city: string };

type DocType = {
  key: string;
  label: string;
  field_schema: FieldDef[];
  default_capability_ids: string[];
  sections_mode: 'multi_section' | 'single_section';
};

type CapMeta = { id: string; label: string; description: string; category: string };

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NoteStartPage() {
  // Auth
  const [authed, setAuthed] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [passBusy, setPassBusy] = useState(false);

  // Catalog
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [docTypeKey, setDocTypeKey] = useState('grant_note');
  const [allCaps, setAllCaps] = useState<CapMeta[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  // Intent + collected fields
  const [intent, setIntent] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({});
  const [orgName, setOrgName] = useState('');
  const [ddOrg, setDdOrg] = useState<{ id: string; name: string } | null>(null);

  // Source documents (optional, collapsible)
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste existing text (optional, collapsible)
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');

  // Optional advanced fields (collapsible)
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Budget picker (per-domain async). Only loaded when the active doc type
  // includes a budget_picker field.
  const [budgetOptions, setBudgetOptions] = useState<BudgetOption[]>([]);
  const [budgetLoadError, setBudgetLoadError] = useState('');

  // Scope (overrideable from doc-type defaults)
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);

  // Submission state
  const [submitterName, setSubmitterName] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyStatus, setBusyStatus] = useState('');
  const [error, setError] = useState('');

  // ─── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (sessionStorage.getItem('staffAuthed') === 'true') setAuthed(true);
    const savedName = localStorage.getItem('staffName');
    if (savedName) setSubmitterName(savedName);
  }, []);

  useEffect(() => {
    if (!authed) return;
    Promise.all([
      fetch('/api/review/doc-types').then(r => r.json()),
      fetch('/api/review/capabilities').then(r => r.json()),
    ]).then(([dt, cap]) => {
      const types: DocType[] = (dt.doc_types || []).map((d: any) => ({
        key: d.key,
        label: d.label,
        field_schema: Array.isArray(d.field_schema) ? d.field_schema : [],
        default_capability_ids: Array.isArray(d.default_capability_ids) ? d.default_capability_ids : [],
        sections_mode: d.sections_mode === 'single_section' ? 'single_section' : 'multi_section',
      }));
      setDocTypes(types);
      const caps: CapMeta[] = (cap.capabilities || []).map((c: any) => ({
        id: c.id, label: c.label, description: c.description, category: c.category,
      }));
      setAllCaps(caps);
      // Initialise scope from active doc type's defaults.
      const active = types.find(t => t.key === docTypeKey) || types[0];
      if (active) {
        setDocTypeKey(active.key);
        setScopeIds(active.default_capability_ids);
      }
      setCatalogLoaded(true);
    }).catch(() => setCatalogLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // When user switches doc type, reset scope to that doc type's defaults.
  const activeDocType = docTypes.find(t => t.key === docTypeKey);
  useEffect(() => {
    if (activeDocType) setScopeIds(activeDocType.default_capability_ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTypeKey, catalogLoaded]);

  // Load budgets when active doc type has a budget_picker field.
  useEffect(() => {
    if (!activeDocType) return;
    const bp = activeDocType.field_schema.find(f => f.type === 'budget_picker');
    if (!bp) { setBudgetOptions([]); return; }
    const domain = bp.budgetDomain || 'Creche';
    setBudgetLoadError('');
    fetch(`/api/budgets?domain=${encodeURIComponent(domain)}`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'failed to load budgets');
        return j.budgets || [];
      })
      .then((rows: BudgetOption[]) => setBudgetOptions(rows))
      .catch(e => {
        setBudgetOptions([]);
        setBudgetLoadError(e.message || 'failed to load budgets');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTypeKey, catalogLoaded]);

  // Org name → DD lookup
  useEffect(() => {
    const name = orgName.trim();
    if (!name) { setDdOrg(null); return; }
    const t = setTimeout(() => {
      fetch('/api/review/orgs').then(r => r.json()).then((orgs: any[]) => {
        const match = orgs.find(o => o.name.toLowerCase() === name.toLowerCase());
        setDdOrg(match ? { id: match.id, name: match.name } : null);
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [orgName]);

  // ─── Auth ──────────────────────────────────────────────────────────────────

  const authSubmit = async () => {
    setPassBusy(true); setPassError('');
    const res = await fetch('/api/review/auth/staff', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase: passInput }),
    });
    setPassBusy(false);
    if (res.ok) { sessionStorage.setItem('staffAuthed', 'true'); setAuthed(true); }
    else setPassError('Wrong passphrase');
  };

  // ─── Files ─────────────────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...arr.filter(f => !existing.has(f.name))];
    });
    setSourcesOpen(true);
  }, []);

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name));

  const uploadFiles = async (): Promise<string[]> => {
    if (files.length === 0) return [];
    setBusyStatus(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);

    const uploadOne = async (file: File): Promise<string> => {
      // Wrap each upload in a 60s timeout so the UI can't hang silently.
      return await Promise.race<string>([
        (async () => {
          const blob = await upload(`${Date.now()}-${file.name}`, file, {
            access: 'public', handleUploadUrl: '/api/review/blob-upload',
          });
          return blob.url;
        })(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error(`Upload of ${file.name} timed out after 60s — likely a Vercel Blob token issue or a 401 from the blob-upload route.`)), 60000),
        ),
      ]);
    };

    try {
      return await Promise.all(files.map(uploadOne));
    } catch (e: any) {
      throw new Error(`File upload failed: ${e?.message || 'unknown'}. Check that BLOB_READ_WRITE_TOKEN is set on Vercel and that /api/review/blob-upload isn't being blocked by middleware.`);
    }
  };

  // ─── Scope helpers ────────────────────────────────────────────────────────

  const dropScope = (id: string) => setScopeIds(s => s.filter(x => x !== id));
  const addScope = (id: string) => { if (!scopeIds.includes(id)) setScopeIds(s => [...s, id]); setScopeMenuOpen(false); };
  const availableScope = allCaps.filter(c => !scopeIds.includes(c.id));

  // ─── Submit ───────────────────────────────────────────────────────────────

  const startDrafting = async () => {
    if (!activeDocType) return;
    if (!submitterName.trim()) { setError('Enter your name first.'); return; }
    if (!intent.trim() && !pastedText.trim() && files.length === 0) {
      setError('Tell me what to write — type intent, paste text, or attach source documents.');
      return;
    }
    setError(''); setBusy(true); setBusyStatus('');

    try {
      const blobUrls = await uploadFiles();
      localStorage.setItem('staffName', submitterName);

      // Build meta from collected field values + the universal fields.
      const meta = activeDocType.field_schema.reduce((acc, f) => {
        const v = fieldValues[f.key];
        if (v === undefined || v === '') return acc;
        acc[f.key] = String(v);
        return acc;
      }, {} as Record<string, string>);

      // Inject orgName explicitly (it's the hero field).
      if (orgName.trim()) meta.orgName = orgName.trim();

      // Find the budget_picker field (if any) so the server can snapshot the
      // comparison against the linked budget at note-create time.
      const budgetField = activeDocType.field_schema.find(f => f.type === 'budget_picker');
      const linkedBudgetId = budgetField ? (fieldValues[budgetField.key] as string) || '' : '';

      setBusyStatus('Creating note…');
      const createRes = await fetch('/api/review/grant-notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          org_name: meta.orgName || '(unnamed)',
          org_city: meta.orgCity || '',
          meeting: meta.meeting || '',
          theme: meta.theme || '',
          grant_number: meta.grantNumber || '',
          grant_amount: meta.grantAmount || '',
          grant_duration: meta.grantDuration || meta.grantDurationMonths || '',
          doc_type: docTypeKey,
          draft_text: pastedText || '',
          source_documents: blobUrls,
          staff_notes: (fieldValues.staffNotes as string) || '',
          submitted_by: submitterName,
          status: 'designing',
          linked_budget_id: linkedBudgetId,
        }),
      });
      const created = await createRes.json();
      if (!created.id) throw new Error(created.error || 'Failed to create note');

      // Kick off RAG ingest for any uploaded docs.
      if (Array.isArray(created.ingest_doc_urls) && created.ingest_doc_urls.length > 0) {
        fetch('/api/review/ingest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ note_id: created.id, doc_urls: created.ingest_doc_urls }),
        }).catch(() => {});
      }

      // Persist the chosen scope as sticky scope on the new note.
      await fetch(`/api/review/grant-notes/${created.id}/scope`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ capability_ids: scopeIds, updated_by: submitterName }),
      }).catch(() => {});

      // Build the initial-draft instruction from intent + collected fields.
      const instructionLines: string[] = [];
      if (intent.trim()) {
        instructionLines.push(intent.trim());
      } else if (pastedText.trim()) {
        instructionLines.push('Use the existing draft text in the document state as the starting point. Polish it per the active capabilities.');
      } else {
        instructionLines.push('Generate the initial document from the attached source materials per the active capabilities.');
      }

      const fieldLines = Object.entries(meta)
        .filter(([k]) => k !== 'orgName' && k !== 'orgCity')
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`);
      if (fieldLines.length > 0) {
        instructionLines.push('');
        instructionLines.push('Provided metadata for this draft:');
        instructionLines.push(...fieldLines);
      }
      if (fieldValues.staffNotes) {
        instructionLines.push('');
        instructionLines.push('Our sense (staff notes — use as raw material, never paraphrase the meta-instruction):');
        instructionLines.push(String(fieldValues.staffNotes));
      }

      setBusyStatus('Drafting (this takes 20–60 seconds)…');
      const orchRes = await fetch(`/api/review/grant-notes/${created.id}/orchestrate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instruction: instructionLines.join('\n'),
          created_by: submitterName,
        }),
      });
      const orchData = await orchRes.json();
      if (orchData.error) {
        throw new Error(`Initial draft failed: ${orchData.error}`);
      }
      if (orchData.clarification_request) {
        // Don't redirect — surface the question right here so the user can
        // refine their input without leaving the entry screen.
        setError(`AI needs more from you to start: ${orchData.clarification_request.message}\n\nThe note has been created (id: ${created.id}) — refine your input below and try again, or open it in the design editor at /grant-notes/notes/${created.id}/design to continue manually.`);
        setBusy(false);
        setBusyStatus('');
        return;
      }

      window.location.href = `/grant-notes/notes/${created.id}/design`;
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
      setBusyStatus('');
    }
  };

  // ─── Field rendering ──────────────────────────────────────────────────────

  const fieldValue = (key: string) => fieldValues[key] ?? '';
  const setFieldValue = (key: string, value: string | boolean) =>
    setFieldValues(prev => ({ ...prev, [key]: value }));

  const renderField = (f: FieldDef) => {
    const id = `field-${f.key}`;
    if (f.type === 'textarea') {
      return (
        <div key={f.key} className="ns-field">
          <label htmlFor={id}>{f.label}{f.required && ' *'}</label>
          <textarea
            id={id}
            rows={f.rows || 4}
            placeholder={f.placeholder}
            value={String(fieldValue(f.key))}
            onChange={e => setFieldValue(f.key, e.target.value)}
          />
        </div>
      );
    }
    if (f.type === 'select') {
      return (
        <div key={f.key} className="ns-field">
          <label htmlFor={id}>{f.label}{f.required && ' *'}</label>
          <select id={id} value={String(fieldValue(f.key))} onChange={e => setFieldValue(f.key, e.target.value)}>
            <option value="">—</option>
            {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    if (f.type === 'budget_picker') {
      return (
        <div key={f.key} className="ns-field">
          <label htmlFor={id}>{f.label}{f.required && ' *'}</label>
          <select id={id} value={String(fieldValue(f.key))} onChange={e => setFieldValue(f.key, e.target.value)}>
            <option value="">— pick a budget —</option>
            {budgetOptions.map(b => (
              <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
            ))}
          </select>
          {budgetLoadError && <div className="ns-muted" style={{ color: '#8b2c25', marginTop: 4 }}>{budgetLoadError}</div>}
          {!budgetLoadError && budgetOptions.length === 0 && (
            <div className="ns-muted" style={{ marginTop: 4 }}>
              No {f.budgetDomain || 'matching'} budgets found in your account. Create one under Pitstops → My Budgets.
            </div>
          )}
        </div>
      );
    }
    if (f.type === 'checkbox') {
      return (
        <div key={f.key} className="ns-field ns-field-checkbox">
          <label>
            <input type="checkbox"
              checked={!!fieldValue(f.key)}
              onChange={e => setFieldValue(f.key, e.target.checked)} />
            {f.label}
          </label>
        </div>
      );
    }
    return (
      <div key={f.key} className="ns-field">
        <label htmlFor={id}>{f.label}{f.required && ' *'}</label>
        <input id={id} type={f.type === 'number' ? 'number' : 'text'}
          placeholder={f.placeholder}
          value={String(fieldValue(f.key))}
          onChange={e => setFieldValue(f.key, e.target.value)} />
      </div>
    );
  };

  // Drop orgName + staffNotes from the schema's progressive section — they're
  // promoted to the top-level hero / narrative spot. Everything else collapses.
  const narrativeField = activeDocType?.field_schema.find(f => f.key === 'staffNotes');
  const collapsibleFields = (activeDocType?.field_schema || [])
    .filter(f => f.key !== 'orgName' && f.key !== 'staffNotes' && f.key !== 'orgCity');
  const cityField = activeDocType?.field_schema.find(f => f.key === 'orgCity');

  // ─── Auth gate ────────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="draft-gate">
        <div className="draft-gate-box">
          <div className="draft-gate-title">Internal Drafting</div>
          <div className="draft-gate-hint">Enter staff passphrase to continue</div>
          <input type="password" className="draft-gate-input" placeholder="Passphrase"
            value={passInput} onChange={e => setPassInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && authSubmit()} autoFocus />
          {passError && <div className="draft-gate-error">{passError}</div>}
          <button className="draft-gate-btn" onClick={authSubmit} disabled={passBusy || !passInput}>
            {passBusy ? 'Checking…' : 'Enter'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Note-start UI ────────────────────────────────────────────────────────

  return (
    <div className="ns-app">
      <style>{NOTE_START_CSS}</style>

      <div className="ns-header">
        <div className="ns-title">Internal Drafting</div>
        <a href="/grant-notes/notes" className="ns-back">← All notes</a>
      </div>

      {/* Doc type pills */}
      <div className="ns-row">
        <div className="ns-label">Doc type</div>
        <div className="ns-pills">
          {docTypes.map(d => (
            <button key={d.key}
              className={`ns-pill${docTypeKey === d.key ? ' active' : ''}`}
              onClick={() => setDocTypeKey(d.key)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scope chips */}
      <div className="ns-row">
        <div className="ns-label">Scope</div>
        <div className="ns-pills">
          {scopeIds.length === 0 && (
            <span className="ns-muted">(empty — only editor primitives)</span>
          )}
          {scopeIds.map(id => {
            const meta = allCaps.find(c => c.id === id);
            return (
              <span key={id} title={meta?.description || id} className="ns-chip">
                {meta?.label || id}
                <button onClick={() => dropScope(id)} className="ns-chip-x" title="Remove">×</button>
              </span>
            );
          })}
          {availableScope.length > 0 && (
            <span className="ns-chip-add-wrap">
              <button onClick={() => setScopeMenuOpen(o => !o)} className="ns-chip-add">+ add</button>
              {scopeMenuOpen && (
                <div className="ns-chip-menu">
                  {availableScope.map(c => (
                    <button key={c.id} onClick={() => addScope(c.id)} className="ns-chip-menu-item">
                      <div className="ns-chip-menu-label">{c.label} <span className="ns-muted">· {c.category}</span></div>
                      <div className="ns-chip-menu-desc">{c.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Hero — intent */}
      <div className="ns-hero">
        <label htmlFor="ns-intent" className="ns-hero-label">What are we writing?</label>
        <textarea
          id="ns-intent"
          rows={4}
          placeholder={'e.g. "draft initial grant note for Deepti Foundation"\ne.g. "send a polite decline to org X — high dependency"\ne.g. "2-para visit summary for the GRM debrief email"'}
          value={intent}
          onChange={e => setIntent(e.target.value)}
        />
      </div>

      {/* Org name — hero */}
      <div className="ns-org">
        <div className="ns-field">
          <label htmlFor="ns-org">Organisation <span className="ns-muted">(optional — enables DD lookup + cross-note retrieval)</span></label>
          <input id="ns-org" type="text" placeholder="Deepti Foundation"
            value={orgName} onChange={e => setOrgName(e.target.value)} />
        </div>
        {cityField && (
          <div className="ns-field">
            <label htmlFor="ns-city">City</label>
            <input id="ns-city" type="text" placeholder="Bangalore"
              value={String(fieldValue('orgCity'))}
              onChange={e => setFieldValue('orgCity', e.target.value)} />
          </div>
        )}
      </div>

      {ddOrg && (
        <div className="ns-dd-banner">
          ✓ Due diligence on file for <strong>{ddOrg.name}</strong>
          <a href={`/due-diligence/${ddOrg.id}`} target="_blank" className="ns-dd-link">View / edit →</a>
        </div>
      )}

      {/* Source documents — collapsible */}
      <div className="ns-section">
        <button className="ns-collapse" onClick={() => setSourcesOpen(o => !o)}>
          <span>{sourcesOpen ? '▾' : '▸'} Attach source documents</span>
          <span className="ns-muted">{files.length > 0 ? `${files.length} attached` : 'optional'}</span>
        </button>
        {sourcesOpen && (
          <div className="ns-section-body">
            <div
              className={`ns-dropzone${dragOver ? ' drag' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}>
              <div className="ns-dropzone-icon">⬆</div>
              <div>Drop files or click to browse</div>
              <div className="ns-muted">PDF, Word, PowerPoint, Excel, images</div>
              <input ref={fileInputRef} type="file" multiple
                accept=".pdf,.pptx,.ppt,.xlsx,.xls,.docx,.doc,.jpg,.jpeg,.png,.txt,.md"
                style={{ display: 'none' }}
                onChange={e => addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <div className="ns-files">
                {files.map(f => (
                  <div key={f.name} className="ns-file">
                    <span>{f.name}</span>
                    <span className="ns-muted">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeFile(f.name)} className="ns-file-x">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="ns-muted">
              Documents are indexed cross-note — past relevant material will be retrievable.
            </div>
          </div>
        )}
      </div>

      {/* Paste existing text — collapsible */}
      <div className="ns-section">
        <button className="ns-collapse" onClick={() => setPasteOpen(o => !o)}>
          <span>{pasteOpen ? '▾' : '▸'} Paste existing text</span>
          <span className="ns-muted">{pastedText ? `${pastedText.length} chars` : 'optional'}</span>
        </button>
        {pasteOpen && (
          <div className="ns-section-body">
            <textarea
              rows={8}
              placeholder="Paste a starting draft — the AI will use this as raw material."
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              className="ns-textarea-full"
            />
          </div>
        )}
      </div>

      {/* Optional additional fields — collapsible */}
      {collapsibleFields.length > 0 && (
        <div className="ns-section">
          <button className="ns-collapse" onClick={() => setAdvancedOpen(o => !o)}>
            <span>{advancedOpen ? '▾' : '▸'} Additional context for this doc type</span>
            <span className="ns-muted">{`${collapsibleFields.length} field${collapsibleFields.length === 1 ? '' : 's'}`}</span>
          </button>
          {advancedOpen && (
            <div className="ns-section-body ns-grid-2">
              {collapsibleFields.map(f => renderField(f))}
            </div>
          )}
        </div>
      )}

      {/* Narrative / "our sense" — promoted */}
      {narrativeField && (
        <div className="ns-section">
          <label className="ns-hero-label" htmlFor={`field-${narrativeField.key}`}>
            {narrativeField.label}
          </label>
          <textarea
            id={`field-${narrativeField.key}`}
            rows={narrativeField.rows || 6}
            placeholder={narrativeField.placeholder || ''}
            value={String(fieldValue(narrativeField.key))}
            onChange={e => setFieldValue(narrativeField.key, e.target.value)}
            className="ns-textarea-full"
          />
        </div>
      )}

      {/* Submit */}
      {error && <div className="ns-error">{error}</div>}

      <div className="ns-submit-row">
        <input type="text" placeholder="Your name"
          value={submitterName} onChange={e => setSubmitterName(e.target.value)}
          className="ns-submitter" />
        <button onClick={startDrafting} disabled={busy} className="ns-submit">
          {busy ? (busyStatus || 'Working…') : 'Start drafting →'}
        </button>
      </div>

      {!catalogLoaded && <div className="ns-muted" style={{ marginTop: 16 }}>Loading catalog…</div>}
    </div>
  );
}

// ─── CSS (inline for now — the new page uses its own scoped styles) ─────────

const NOTE_START_CSS = `
.ns-app { max-width: 860px; margin: 0 auto; padding: 32px 24px 64px; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
.ns-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.ns-title { font-size: 18px; font-weight: 700; }
.ns-back { color: #555; text-decoration: none; font-size: 13px; }
.ns-back:hover { text-decoration: underline; }
.ns-row { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.ns-label { font-size: 12px; color: #555; font-weight: 600; letter-spacing: 0.3px; padding-top: 6px; min-width: 64px; }
.ns-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.ns-pill { background: #f4f4f0; border: 1px solid #d4d2c8; color: #444; padding: 4px 12px; border-radius: 16px; cursor: pointer; font-size: 13px; }
.ns-pill:hover { background: #ede9d8; }
.ns-pill.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
.ns-chip { display: inline-flex; align-items: center; gap: 4px; background: #fff; border: 1px solid #d4d2c8; border-radius: 12px; padding: 2px 4px 2px 10px; font-size: 12px; }
.ns-chip-x { border: none; background: transparent; cursor: pointer; color: #888; padding: 0 4px; font-size: 14px; line-height: 1; }
.ns-chip-add-wrap { position: relative; display: inline-block; }
.ns-chip-add { border: 1px dashed #b8b5a8; background: transparent; border-radius: 12px; padding: 2px 10px; cursor: pointer; font-size: 12px; color: #555; }
.ns-chip-menu { position: absolute; top: 100%; left: 0; margin-top: 4px; z-index: 50; background: #fff; border: 1px solid #d4d2c8; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); min-width: 280px; max-width: 360px; }
.ns-chip-menu-item { display: block; width: 100%; text-align: left; background: transparent; border: none; cursor: pointer; padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #f4f3ee; }
.ns-chip-menu-item:hover { background: #f8f7f2; }
.ns-chip-menu-label { font-weight: 600; }
.ns-chip-menu-desc { color: #666; font-size: 11px; margin-top: 2px; }
.ns-muted { color: #888; font-size: 12px; }
.ns-hero { margin: 24px 0; }
.ns-hero-label { display: block; font-size: 13px; font-weight: 600; color: #333; margin-bottom: 6px; }
.ns-hero textarea, .ns-textarea-full { width: 100%; font-size: 14px; padding: 10px 12px; border: 1px solid #d4d2c8; border-radius: 6px; font-family: inherit; box-sizing: border-box; resize: vertical; line-height: 1.5; }
.ns-hero textarea:focus, .ns-textarea-full:focus { outline: none; border-color: #1f4d3a; }
.ns-org { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px; }
.ns-field { display: flex; flex-direction: column; }
.ns-field label { font-size: 12px; font-weight: 600; color: #555; margin-bottom: 4px; }
.ns-field input, .ns-field select, .ns-field textarea { font-size: 13px; padding: 6px 10px; border: 1px solid #d4d2c8; border-radius: 4px; font-family: inherit; box-sizing: border-box; }
.ns-field input:focus, .ns-field select:focus, .ns-field textarea:focus { outline: none; border-color: #1f4d3a; }
.ns-field-checkbox label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #333; font-weight: 500; cursor: pointer; }
.ns-field-checkbox input { width: 14px; height: 14px; }
.ns-dd-banner { background: #ecf6ef; border: 1px solid #c1deca; padding: 8px 12px; border-radius: 4px; display: flex; align-items: center; gap: 10px; font-size: 13px; margin-bottom: 16px; }
.ns-dd-link { margin-left: auto; color: #1f4d3a; text-decoration: none; }
.ns-section { margin-bottom: 14px; }
.ns-collapse { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 10px 0; background: transparent; border: none; border-bottom: 1px solid #e5e3da; cursor: pointer; font-size: 13px; font-weight: 600; color: #333; }
.ns-collapse:hover { color: #1f4d3a; }
.ns-section-body { padding: 12px 0 4px; }
.ns-dropzone { border: 2px dashed #d4d2c8; border-radius: 6px; padding: 32px 16px; text-align: center; cursor: pointer; color: #666; }
.ns-dropzone:hover, .ns-dropzone.drag { border-color: #1f4d3a; color: #1f4d3a; background: #f4f8f5; }
.ns-dropzone-icon { font-size: 20px; margin-bottom: 6px; }
.ns-files { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
.ns-file { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: #f8f7f2; border-radius: 3px; font-size: 12px; }
.ns-file-x { margin-left: auto; border: none; background: transparent; cursor: pointer; color: #888; font-size: 14px; }
.ns-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ns-error { background: #fce5e3; border: 1px solid #e6a9a3; padding: 8px 12px; border-radius: 4px; color: #8b2c25; font-size: 13px; margin: 12px 0; }
.ns-submit-row { display: flex; gap: 8px; margin-top: 24px; align-items: center; }
.ns-submitter { padding: 8px 12px; border: 1px solid #d4d2c8; border-radius: 4px; font-size: 13px; width: 180px; box-sizing: border-box; }
.ns-submit { padding: 10px 20px; background: #1a1a1a; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; }
.ns-submit:hover:not(:disabled) { background: #2a2a2a; }
.ns-submit:disabled { opacity: 0.5; cursor: not-allowed; }
`;
