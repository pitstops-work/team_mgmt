'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { upload } from '@vercel/blob/client';

type Meta = {
  meeting: string; orgName: string; orgCity: string; theme: string; geography: string;
  presentedBy: string; visitedBy: string; progVisitDate: string; finVisitDate: string;
  grmDate: string; delayRationale: string; grantNumber: string; grantAmount: string;
  grantDuration: string; beneficiaryCount: string; isRenewal: boolean;
  programmeName: string; vendors: string; scale: string; hasPilot: boolean; pilotNotes: string;
};

const EMPTY_META: Meta = {
  meeting: '', orgName: '', orgCity: '', theme: '', geography: '',
  presentedBy: '', visitedBy: '', progVisitDate: '', finVisitDate: '',
  grmDate: '', delayRationale: 'NA', grantNumber: '1st',
  grantAmount: '', grantDuration: '3', beneficiaryCount: '', isRenewal: false,
  programmeName: '', vendors: '', scale: '', hasPilot: false, pilotNotes: '',
};

const THEMES = [
  'Adolescent Girls', 'Rural Livelihoods', 'Access to Justice',
  'Early Childhood', 'Urban Livelihoods', 'Health', 'Education', 'Welfare & Rights', 'Other',
];

export default function DraftPage() {
  const [authed, setAuthed] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [passBusy, setPassBusy] = useState(false);

  const [outputMode, setOutputMode] = useState<'draft' | 'design'>('draft');
  const [docType, setDocType] = useState('grant_note');
  const [docTypes, setDocTypes] = useState<Array<{ key: string; label: string }>>([
    { key: 'grant_note', label: 'Grant Note' },
    { key: 'programme_design', label: 'Programme Design' },
  ]);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [staffNotes, setStaffNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitterName, setSubmitterName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/review/review/doc-types').then(r => r.json()).then(d => {
      if (d.doc_types?.length) setDocTypes(d.doc_types.map((dt: any) => ({ key: dt.key, label: dt.label })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('staffAuthed') === 'true') setAuthed(true);
    const saved = localStorage.getItem('staffName');
    if (saved) setSubmitterName(saved);
  }, []);

  const authSubmit = async () => {
    setPassBusy(true); setPassError('');
    const res = await fetch('/api/review/review/auth/staff', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase: passInput }),
    });
    setPassBusy(false);
    if (res.ok) { sessionStorage.setItem('staffAuthed', 'true'); setAuthed(true); }
    else setPassError('Wrong passphrase');
  };

  const set = (key: keyof Meta) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setMeta(prev => ({ ...prev, [key]: value }));
  };

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...arr.filter(f => !existing.has(f.name))];
    });
  }, []);

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name));

  const uploadFiles = async (): Promise<string[]> => {
    if (files.length === 0) return [];
    setUploadStatus(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);
    const urls = await Promise.all(files.map(async (file) => {
      const blob = await upload(`${Date.now()}-${file.name}`, file, {
        access: 'public', handleUploadUrl: '/api/review/blob-upload',
      });
      return blob.url;
    }));
    setUploadStatus('');
    return urls;
  };

  // Draft mode: generate text draft (streaming)
  const generateDraft = async () => {
    if (!meta.orgName.trim()) { setError('Organisation name is required.'); return; }
    if (!staffNotes.trim()) { setError('"Our sense of the org" is required.'); return; }
    setError(''); setGenerating(true); setDraft(''); setUploadStatus('');

    try {
      const blobUrls = await uploadFiles();

      const fd = new FormData();
      Object.entries(meta).forEach(([k, v]) => fd.append(k, String(v)));
      fd.append('staffNotes', staffNotes);
      fd.append('docType', docType);
      fd.append('blobUrls', JSON.stringify(blobUrls));

      const res = await fetch('/api/review/review/draft', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text();
        let msg = 'Generation failed';
        try { msg = JSON.parse(text).error || msg; } catch { msg = `Server error (${res.status}): ${text.slice(0, 200)}`; }
        throw new Error(msg);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setDraft(accumulated);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false); setUploadStatus('');
    }
  };

  // Design mode: upload docs, create note with source_documents, go straight to design editor
  const generateDesign = async () => {
    if (!meta.orgName.trim()) { setError('Organisation name is required.'); return; }
    if (!submitterName.trim()) { setError('Enter your name before continuing.'); return; }
    if (files.length === 0) { setError('Upload at least one document to generate a visual design.'); return; }
    setError(''); setGenerating(true);

    try {
      const blobUrls = await uploadFiles();
      localStorage.setItem('staffName', submitterName);

      const res = await fetch('/api/review/review/grant-notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          org_name: meta.orgName, org_city: meta.orgCity, meeting: meta.meeting,
          theme: meta.theme, grant_number: meta.grantNumber, grant_amount: meta.grantAmount,
          grant_duration: meta.grantDuration, doc_type: docType,
          source_documents: blobUrls, staff_notes: staffNotes,
          submitted_by: submitterName, status: 'designing',
        }),
      });
      const d = await res.json();
      if (!d.id) throw new Error(d.error || 'Failed to create note');
      window.location.href = `/notes/${d.id}/design`;
    } catch (e: any) {
      setError(e.message);
      setGenerating(false); setUploadStatus('');
    }
  };

  const downloadWord = async () => {
    if (!draft.trim()) return;
    const res = await fetch('/api/review/review/export', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: draft, org_name: meta.orgName, org_city: meta.orgCity,
        meeting: meta.meeting, theme: meta.theme, grant_number: meta.grantNumber,
        grant_amount: meta.grantAmount, grant_duration: meta.grantDuration, doc_type: docType,
      }),
    });
    if (!res.ok) { setError('Word export failed'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grant-note-${(meta.orgName || 'draft').replace(/\s+/g, '-').toLowerCase()}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Draft mode: send text draft to design editor
  const designDocument = async () => {
    if (!draft.trim()) return;
    if (!submitterName.trim()) { setError('Enter your name before continuing.'); return; }
    setSubmitting(true);
    localStorage.setItem('staffName', submitterName);
    try {
      const res = await fetch('/api/review/review/grant-notes', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          org_name: meta.orgName, org_city: meta.orgCity, meeting: meta.meeting,
          theme: meta.theme, grant_number: meta.grantNumber, grant_amount: meta.grantAmount,
          grant_duration: meta.grantDuration, doc_type: docType,
          draft_text: draft, submitted_by: submitterName, status: 'designing',
        }),
      });
      const d = await res.json();
      window.location.href = `/notes/${d.id}/design`;
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  const fileIcon = (name: string) => {
    if (name.endsWith('.pdf')) return '📄';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return '📊';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return '📝';
    if (name.endsWith('.pptx') || name.endsWith('.ppt')) return '📊';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')) return '🖼';
    return '📎';
  };

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

  const isDesign = outputMode === 'design';

  return (
    <div className="draft-app">
      <div className="draft-inputs">
        <div className="draft-brand">
          <div className="draft-brand-label">Internal Document</div>
          <a href="/review/notes" className="draft-back">← All notes</a>
        </div>

        {/* Doc type toggle */}
        <div className="draft-section">
          <div className="draft-doctype-toggle">
            {docTypes.map(dt => (
              <button
                key={dt.key}
                className={`draft-doctype-btn${docType === dt.key ? ' active' : ''}`}
                onClick={() => setDocType(dt.key)}
              >
                {dt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Output mode toggle */}
        <div className="draft-section">
          <div className="draft-mode-toggle">
            <button className={`draft-mode-btn${!isDesign ? ' active' : ''}`}
              onClick={() => setOutputMode('draft')}>
              <span className="draft-mode-icon">≡</span>
              <span>
                <span className="draft-mode-label">Draft</span>
                <span className="draft-mode-hint">Text document + Word export</span>
              </span>
            </button>
            <button className={`draft-mode-btn${isDesign ? ' active' : ''}`}
              onClick={() => setOutputMode('design')}>
              <span className="draft-mode-icon">◈</span>
              <span>
                <span className="draft-mode-label">Design</span>
                <span className="draft-mode-hint">Visual interactive review document</span>
              </span>
            </button>
          </div>
        </div>

        {/* Metadata form */}
        <div className="draft-section">
          <div className="draft-section-title">{docType === 'programme_design' ? 'Programme details' : 'Meeting & grant details'}</div>

          <div className="draft-field">
            <label>Meeting</label>
            <input placeholder="e.g. 30th Apr'26 SGM" value={meta.meeting} onChange={set('meeting')} />
          </div>

          {docType === 'programme_design' && (
            <div className="draft-field">
              <label>Programme / concept name</label>
              <input placeholder="Urban Food Distribution — Bangalore" value={meta.programmeName} onChange={set('programmeName')} />
            </div>
          )}

          <div className="draft-row">
            <div className="draft-field">
              <label>{docType === 'programme_design' ? 'Implementation partner' : 'Organisation name'}</label>
              <input placeholder={docType === 'programme_design' ? 'Sampark' : 'Deepti Foundation'} value={meta.orgName} onChange={set('orgName')} />
            </div>
            <div className="draft-field">
              <label>City</label>
              <input placeholder="Bangalore" value={meta.orgCity} onChange={set('orgCity')} />
            </div>
          </div>

          {docType === 'programme_design' && (
            <div className="draft-field">
              <label>Key vendors / partners</label>
              <input placeholder="Ramani Food (kitchen), JustDelivery (transport)" value={meta.vendors} onChange={set('vendors')} />
            </div>
          )}

          <div className="draft-row">
            <div className="draft-field">
              <label>Theme</label>
              <select value={meta.theme} onChange={set('theme')}>
                <option value="">Select theme</option>
                {THEMES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="draft-field">
              <label>Geography</label>
              <input placeholder="Bhalaswa Dairy, North Delhi" value={meta.geography} onChange={set('geography')} />
            </div>
          </div>

          <div className="draft-row">
            <div className="draft-field">
              <label>Presented by</label>
              <input placeholder="Kiran P" value={meta.presentedBy} onChange={set('presentedBy')} />
            </div>
            <div className="draft-field">
              <label>Visited by</label>
              <input placeholder="Kiran, Vishnu" value={meta.visitedBy} onChange={set('visitedBy')} />
            </div>
          </div>

          <div className="draft-row">
            <div className="draft-field">
              <label>Programme visit date</label>
              <input placeholder="1st February 2026" value={meta.progVisitDate} onChange={set('progVisitDate')} />
            </div>
            <div className="draft-field">
              <label>Finance visit date</label>
              <input placeholder="9th April 2026" value={meta.finVisitDate} onChange={set('finVisitDate')} />
            </div>
          </div>

          <div className="draft-row">
            <div className="draft-field">
              <label>GRM / Debrief date</label>
              <input placeholder="31st March 2026" value={meta.grmDate} onChange={set('grmDate')} />
            </div>
            <div className="draft-field">
              <label>Rationale for delay</label>
              <input placeholder="NA" value={meta.delayRationale} onChange={set('delayRationale')} />
            </div>
          </div>

          <div className="draft-row">
            <div className="draft-field">
              <label>Grant amount</label>
              <input placeholder="₹ 74.64 L" value={meta.grantAmount} onChange={set('grantAmount')} />
            </div>
            <div className="draft-field">
              <label>Duration (years)</label>
              <input type="number" min="1" max="5" value={meta.grantDuration} onChange={set('grantDuration')} />
            </div>
          </div>

          {docType === 'grant_note' && (
            <div className="draft-row">
              <div className="draft-field">
                <label>Grant number</label>
                <select value={meta.grantNumber} onChange={set('grantNumber')}>
                  <option value="1st">1st</option>
                  <option value="2nd">2nd</option>
                  <option value="3rd">3rd</option>
                </select>
              </div>
              <div className="draft-field">
                <label>Beneficiary count</label>
                <input placeholder="~500 adolescent girls" value={meta.beneficiaryCount} onChange={set('beneficiaryCount')} />
              </div>
              <div className="draft-field draft-checkbox-field">
                <label>
                  <input type="checkbox" checked={meta.isRenewal} onChange={set('isRenewal')} />
                  Renewal grant
                </label>
              </div>
            </div>
          )}

          {docType === 'programme_design' && (
            <>
              <div className="draft-field">
                <label>Scale / daily target</label>
                <input placeholder="1,500 meals/day across 5 hotspots" value={meta.scale} onChange={set('scale')} />
              </div>
              <div className="draft-field draft-checkbox-field">
                <label>
                  <input type="checkbox" checked={meta.hasPilot} onChange={set('hasPilot')} />
                  Prior pilot exists
                </label>
              </div>
              {meta.hasPilot && (
                <div className="draft-field">
                  <label>Pilot notes</label>
                  <input placeholder="Pushcart model — Peenya; van model failed" value={meta.pilotNotes} onChange={set('pilotNotes')} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Upload */}
        <div className="draft-section">
          <div className="draft-section-title">Upload documents</div>
          <div className="draft-section-hint">
            {isDesign
              ? 'Required for Design mode — Claude reads these directly to build the visual document'
              : 'Proposal, annual reports, budget Excel, MIS data, emails'}
          </div>
          <div className={`draft-dropzone${dragOver ? ' drag-over' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}>
            <div className="draft-dropzone-icon">⬆</div>
            <div>Drop files here or click to browse</div>
            <div className="draft-dropzone-hint">PDF, Word, PowerPoint, Excel, images (JPG, PNG)</div>
            <input ref={fileInputRef} type="file" multiple
              accept=".pdf,.pptx,.ppt,.xlsx,.xls,.docx,.doc,.jpg,.jpeg,.png,.txt,.md"
              style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />
          </div>
          {files.length > 0 && (
            <div className="draft-file-list">
              {files.map(f => (
                <div key={f.name} className="draft-file-item">
                  <span className="draft-file-icon">{fileIcon(f.name)}</span>
                  <span className="draft-file-name">{f.name}</span>
                  <span className="draft-file-size">{(f.size / 1024).toFixed(0)} KB</span>
                  <button className="draft-file-remove" onClick={() => removeFile(f.name)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Staff notes */}
        <div className="draft-section">
          <div className="draft-section-title">Our sense of the org</div>
          <div className="draft-section-hint">Field observations, concerns, relationship history, recommendation. This is what Claude cannot read from documents.</div>
          <textarea className="draft-notes"
            placeholder="Write your candid assessment here."
            value={staffNotes} onChange={e => setStaffNotes(e.target.value)} rows={8} />
        </div>

        {error && <div className="draft-error">{error}</div>}

        {isDesign ? (
          <div className="draft-design-actions">
            <div className="draft-submit-row">
              <input className="draft-submitter-input" placeholder="Your name"
                value={submitterName} onChange={e => setSubmitterName(e.target.value)} />
              <button className="draft-generate-btn draft-generate-design-btn"
                onClick={generateDesign} disabled={generating}>
                {generating
                  ? <><span className="draft-spinner" />{uploadStatus || 'Uploading & saving…'}</>
                  : `Generate visual design →`}
              </button>
            </div>
            <p className="draft-design-hint">
              Claude will read your documents and build a visual section-by-section review document with infographics, tables, and decision points. You can edit it before submitting to leadership.
            </p>
          </div>
        ) : (
          <button className="draft-generate-btn" onClick={generateDraft} disabled={generating}>
            {generating
              ? <><span className="draft-spinner" />Generating…</>
              : `Generate ${docType === 'programme_design' ? 'programme design' : 'grant note'}`}
          </button>
        )}
      </div>

      {/* Right panel — only shown in Draft mode */}
      {!isDesign && (
        <div className={`draft-output${draft ? ' has-draft' : ''}`}>
          {!draft && !generating && (
            <div className="draft-output-empty">
              <div className="draft-output-empty-icon">◎</div>
              <div>Fill in the details and upload documents on the left, then hit Generate.</div>
              <div className="draft-output-empty-hint">The draft will appear here, fully editable.</div>
            </div>
          )}
          {generating && (
            <div className="draft-output-empty">
              <div className="draft-output-empty-icon draft-pulse">◎</div>
              <div>{uploadStatus || 'Reading documents and drafting…'}</div>
              <div className="draft-output-empty-hint">{uploadStatus ? 'Then Claude will draft the note.' : 'This takes 20–40 seconds.'}</div>
            </div>
          )}
          {draft && (
            <>
              <div className="draft-output-header">
                <div className="draft-output-title">Draft — {meta.orgName || 'Document'}</div>
                <div className="draft-output-actions">
                  <button className="draft-copy-btn" onClick={() => navigator.clipboard.writeText(draft)}>Copy</button>
                  {docType === 'grant_note' && (
                    <button className="draft-copy-btn" onClick={downloadWord}>↓ Word</button>
                  )}
                  <div className="draft-submit-row">
                    <input className="draft-submitter-input" placeholder="Your name"
                      value={submitterName} onChange={e => setSubmitterName(e.target.value)} />
                    <button className="draft-submit-btn" onClick={designDocument}
                      disabled={submitting || !submitterName.trim()}>
                      {submitting ? 'Saving…' : 'Design document →'}
                    </button>
                  </div>
                </div>
              </div>
              <textarea className="draft-output-text" value={draft}
                onChange={e => setDraft(e.target.value)} spellCheck />
            </>
          )}
        </div>
      )}
    </div>
  );
}
