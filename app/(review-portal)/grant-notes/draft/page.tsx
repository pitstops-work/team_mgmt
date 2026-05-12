'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { upload } from '@vercel/blob/client';

// ─── Types ───────────────────────────────────────────────────────────────────

type Meta = {
  meeting: string; orgName: string; orgCity: string; theme: string; geography: string;
  presentedBy: string; visitedBy: string; progVisitDate: string; finVisitDate: string;
  grmDate: string; delayRationale: string; grantNumber: string; grantAmount: string;
  grantDuration: string; beneficiaryCount: string; isRenewal: boolean;
  programmeName: string; vendors: string; scale: string; hasPilot: boolean; pilotNotes: string;
};

export type FundingRow = {
  id: string; donor: string; grantType: string; di: string;
  fy2223: string; fy2324: string; fy2425: string; fy2526: string; fy2627: string;
};
export type ExpenditureRow = { id: string; fy: string; salary: string; programme: string; admin: string; capital: string; };
export type TeamRow = { id: string; designation: string; fte: string; monthlySalary: string; };

type OrgCompliance = {
  registrationType: string; yearOfRegistration: string;
  taxStatus12a: string; taxStatus80g: string;
  fcraStatus: string; fcraValidTill: string;
  boardSize: string; booksLocation: string; accountingSoftware: string;
  pendingItNotices: string; pendingItNoticesDetails: string; governanceNotes: string;
};

type PddData = {
  context: string; goal: string; historyWithFoundation: string;
  effects: string[]; keyInterventions: string[]; peopleInvolved: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY_META: Meta = {
  meeting: '', orgName: '', orgCity: '', theme: '', geography: '',
  presentedBy: '', visitedBy: '', progVisitDate: '', finVisitDate: '',
  grmDate: '', delayRationale: 'NA', grantNumber: '1st',
  grantAmount: '', grantDuration: '3', beneficiaryCount: '', isRenewal: false,
  programmeName: '', vendors: '', scale: '', hasPilot: false, pilotNotes: '',
};

const EMPTY_ORG: OrgCompliance = {
  registrationType: '', yearOfRegistration: '',
  taxStatus12a: '', taxStatus80g: '',
  fcraStatus: '', fcraValidTill: '',
  boardSize: '', booksLocation: '', accountingSoftware: '',
  pendingItNotices: '', pendingItNoticesDetails: '', governanceNotes: '',
};

const EMPTY_PDD: PddData = {
  context: '', goal: '', historyWithFoundation: '',
  effects: [''], keyInterventions: [''], peopleInvolved: '',
};

const THEMES = [
  'Adolescent Girls', 'Rural Livelihoods', 'Access to Justice',
  'Early Childhood', 'Urban Livelihoods', 'Health', 'Education', 'Welfare & Rights', 'Other',
];

const FUNDING_YEARS: Array<[keyof FundingRow, string]> = [
  ['fy2223', 'FY22-23'],
  ['fy2324', 'FY23-24'],
  ['fy2425', 'FY24-25'],
  ['fy2526', 'FY25-26'],
  ['fy2627', 'FY26-27'],
];

const newId = () => Math.random().toString(36).slice(2, 9);
const emptyFunding = (): FundingRow => ({ id: newId(), donor: '', grantType: '', di: '', fy2223: '', fy2324: '', fy2425: '', fy2526: '', fy2627: '' });
const emptyExp = (): ExpenditureRow => ({ id: newId(), fy: '', salary: '', programme: '', admin: '', capital: '' });
const emptyTeam = (): TeamRow => ({ id: newId(), designation: '', fte: '100', monthlySalary: '' });

// ─── Component ───────────────────────────────────────────────────────────────

export default function DraftPage() {
  // Auth
  const [authed, setAuthed] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [passBusy, setPassBusy] = useState(false);

  // Output mode
  const [outputMode, setOutputMode] = useState<'draft' | 'design'>('draft');
  const [docType, setDocType] = useState('grant_note');
  const [docTypes, setDocTypes] = useState<Array<{ key: string; label: string }>>([
    { key: 'grant_note', label: 'Grant Note' },
    { key: 'programme_design', label: 'Programme Design' },
  ]);

  // Core form
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

  // Collapsible section state
  const [orgOpen, setOrgOpen] = useState(false);
  const [finOpen, setFinOpen] = useState(false);
  const [pddOpen, setPddOpen] = useState(false);

  // Structured inputs
  const [org, setOrg] = useState<OrgCompliance>(EMPTY_ORG);
  const [fundingRows, setFundingRows] = useState<FundingRow[]>([]);
  const [expenditureRows, setExpenditureRows] = useState<ExpenditureRow[]>([]);
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [statutoryNotes, setStatutoryNotes] = useState('');
  const [pdd, setPdd] = useState<PddData>(EMPTY_PDD);

  // ─── Row helpers ────────────────────────────────────────────────────────────

  const updFunding = (id: string, field: keyof FundingRow, val: string) =>
    setFundingRows(r => r.map(x => x.id === id ? { ...x, [field]: val } : x));
  const updExp = (id: string, field: keyof ExpenditureRow, val: string) =>
    setExpenditureRows(r => r.map(x => x.id === id ? { ...x, [field]: val } : x));
  const updTeam = (id: string, field: keyof TeamRow, val: string) =>
    setTeamRows(r => r.map(x => x.id === id ? { ...x, [field]: val } : x));
  const updEffect = (i: number, val: string) =>
    setPdd(p => { const e = [...p.effects]; e[i] = val; return { ...p, effects: e }; });
  const updIntervention = (i: number, val: string) =>
    setPdd(p => { const k = [...p.keyInterventions]; k[i] = val; return { ...p, keyInterventions: k }; });

  const expTotal = (row: ExpenditureRow) =>
    (['salary', 'programme', 'admin', 'capital'] as const)
      .reduce((s, k) => s + (parseFloat(row[k]) || 0), 0);
  const teamAnnual = (row: TeamRow): string | null =>
    row.monthlySalary ? (parseFloat(row.monthlySalary) * 12 / 100000).toFixed(2) : null;

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/review/doc-types').then(r => r.json()).then(d => {
      if (d.doc_types?.length) setDocTypes(d.doc_types.map((dt: any) => ({ key: dt.key, label: dt.label })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem('staffAuthed') === 'true') setAuthed(true);
    const saved = localStorage.getItem('staffName');
    if (saved) setSubmitterName(saved);
  }, []);

  // ─── Auth ───────────────────────────────────────────────────────────────────

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

  // ─── Form helpers ───────────────────────────────────────────────────────────

  const set = (key: keyof Meta) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setMeta(prev => ({ ...prev, [key]: value }));
  };

  const setOrgField = (key: keyof OrgCompliance) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setOrg(o => ({ ...o, [key]: e.target.value }));

  // ─── Files ──────────────────────────────────────────────────────────────────

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

  // ─── Generation ─────────────────────────────────────────────────────────────

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

      // Org & compliance
      Object.entries(org).forEach(([k, v]) => fd.append(`org_${k}`, v));

      // Funding & finance
      fd.append('fundingRows', JSON.stringify(fundingRows.filter(r => r.donor)));
      fd.append('expenditureRows', JSON.stringify(expenditureRows.filter(r => r.fy)));
      fd.append('teamRows', JSON.stringify(teamRows.filter(r => r.designation)));
      fd.append('statutoryNotes', statutoryNotes);

      // Programme design
      fd.append('pddContext', pdd.context);
      fd.append('pddGoal', pdd.goal);
      fd.append('pddHistory', pdd.historyWithFoundation);
      fd.append('pddEffects', JSON.stringify(pdd.effects.filter(Boolean)));
      fd.append('pddInterventions', JSON.stringify(pdd.keyInterventions.filter(Boolean)));
      fd.append('pddPeople', pdd.peopleInvolved);

      const res = await fetch('/api/review/draft', { method: 'POST', body: fd });
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

  const generateDesign = async () => {
    if (!meta.orgName.trim()) { setError('Organisation name is required.'); return; }
    if (!submitterName.trim()) { setError('Enter your name before continuing.'); return; }
    if (files.length === 0) { setError('Upload at least one document to generate a visual design.'); return; }
    setError(''); setGenerating(true);

    try {
      const blobUrls = await uploadFiles();
      localStorage.setItem('staffName', submitterName);

      const res = await fetch('/api/review/grant-notes', {
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
    const res = await fetch('/api/review/export', {
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

  const designDocument = async () => {
    if (!draft.trim()) return;
    if (!submitterName.trim()) { setError('Enter your name before continuing.'); return; }
    setSubmitting(true);
    localStorage.setItem('staffName', submitterName);
    try {
      const res = await fetch('/api/review/grant-notes', {
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

  // ─── JSX helpers ────────────────────────────────────────────────────────────

  const fileIcon = (name: string) => {
    if (name.endsWith('.pdf')) return '📄';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return '📊';
    if (name.endsWith('.docx') || name.endsWith('.doc')) return '📝';
    if (name.endsWith('.pptx') || name.endsWith('.ppt')) return '📊';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')) return '🖼';
    return '📎';
  };

  // ─── Auth gate ──────────────────────────────────────────────────────────────

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
          <a href="/grant-notes/notes" className="draft-back">← All notes</a>
        </div>

        {/* Doc type toggle */}
        <div className="draft-section">
          <div className="draft-doctype-toggle">
            {docTypes.map(dt => (
              <button key={dt.key} className={`draft-doctype-btn${docType === dt.key ? ' active' : ''}`}
                onClick={() => setDocType(dt.key)}>
                {dt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Output mode toggle */}
        <div className="draft-section">
          <div className="draft-mode-toggle">
            <button className={`draft-mode-btn${!isDesign ? ' active' : ''}`} onClick={() => setOutputMode('draft')}>
              <span className="draft-mode-icon">≡</span>
              <span>
                <span className="draft-mode-label">Draft</span>
                <span className="draft-mode-hint">Text document + Word export</span>
              </span>
            </button>
            <button className={`draft-mode-btn${isDesign ? ' active' : ''}`} onClick={() => setOutputMode('design')}>
              <span className="draft-mode-icon">◈</span>
              <span>
                <span className="draft-mode-label">Design</span>
                <span className="draft-mode-hint">Visual interactive review document</span>
              </span>
            </button>
          </div>
        </div>

        {/* ── Meeting & grant details ─────────────────────────────────────────── */}
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

        {/* ── Organisation & Compliance ───────────────────────────────────────── */}
        <div className="draft-section">
          <div className="draft-collapsible-header" onClick={() => setOrgOpen(o => !o)}>
            <div>
              <div className="draft-section-title">Organisation &amp; Compliance</div>
              <div className="draft-section-hint">Registration, tax status, governance, books of accounts</div>
            </div>
            <span className="draft-collapsible-toggle">{orgOpen ? '▲' : '▼'}</span>
          </div>
          {orgOpen && (
            <div className="draft-collapsible-body">
              <div className="draft-row">
                <div className="draft-field">
                  <label>Registration type</label>
                  <select value={org.registrationType} onChange={setOrgField('registrationType')}>
                    <option value="">Select</option>
                    <option>Society</option>
                    <option>Trust</option>
                    <option>Section 8 Company</option>
                  </select>
                </div>
                <div className="draft-field">
                  <label>Year of registration</label>
                  <input placeholder="2006" value={org.yearOfRegistration} onChange={setOrgField('yearOfRegistration')} />
                </div>
              </div>
              <div className="draft-row">
                <div className="draft-field">
                  <label>12A</label>
                  <select value={org.taxStatus12a} onChange={setOrgField('taxStatus12a')}>
                    <option value="">Select</option>
                    <option>Valid — Permanent</option>
                    <option>Valid — Provisional</option>
                    <option>Not available</option>
                  </select>
                </div>
                <div className="draft-field">
                  <label>80G</label>
                  <select value={org.taxStatus80g} onChange={setOrgField('taxStatus80g')}>
                    <option value="">Select</option>
                    <option>Valid — Permanent</option>
                    <option>Valid — Provisional</option>
                    <option>Not available</option>
                  </select>
                </div>
              </div>
              <div className="draft-row">
                <div className="draft-field">
                  <label>FCRA</label>
                  <select value={org.fcraStatus} onChange={setOrgField('fcraStatus')}>
                    <option value="">Select</option>
                    <option>Registered</option>
                    <option>Not registered</option>
                    <option>Cancelled</option>
                    <option>Denied</option>
                  </select>
                </div>
                {org.fcraStatus === 'Registered' && (
                  <div className="draft-field">
                    <label>FCRA valid till</label>
                    <input placeholder="Mar 2027" value={org.fcraValidTill} onChange={setOrgField('fcraValidTill')} />
                  </div>
                )}
              </div>
              <div className="draft-row">
                <div className="draft-field">
                  <label>Board members</label>
                  <input type="number" min="1" placeholder="9" value={org.boardSize} onChange={setOrgField('boardSize')} />
                </div>
                <div className="draft-field">
                  <label>Books of accounts</label>
                  <select value={org.booksLocation} onChange={setOrgField('booksLocation')}>
                    <option value="">Select</option>
                    <option>In-house</option>
                    <option>Outsourced</option>
                  </select>
                </div>
                <div className="draft-field">
                  <label>Software</label>
                  <input placeholder="Tally" value={org.accountingSoftware} onChange={setOrgField('accountingSoftware')} />
                </div>
              </div>
              <div className="draft-row">
                <div className="draft-field">
                  <label>Pending IT notices</label>
                  <select value={org.pendingItNotices} onChange={setOrgField('pendingItNotices')}>
                    <option value="">Select</option>
                    <option>No</option>
                    <option>Yes</option>
                  </select>
                </div>
                {org.pendingItNotices === 'Yes' && (
                  <div className="draft-field">
                    <label>Details</label>
                    <input placeholder="Demand notice for AY23-24…" value={org.pendingItNoticesDetails} onChange={setOrgField('pendingItNoticesDetails')} />
                  </div>
                )}
              </div>
              <div className="draft-field">
                <label>Governance notes</label>
                <textarea className="draft-notes" rows={3}
                  placeholder="Family members on board, related-party transactions, POSH compliance, any concerns…"
                  value={org.governanceNotes} onChange={setOrgField('governanceNotes')} />
              </div>
            </div>
          )}
        </div>

        {/* ── Funding & Finance ───────────────────────────────────────────────── */}
        <div className="draft-section">
          <div className="draft-collapsible-header" onClick={() => setFinOpen(o => !o)}>
            <div>
              <div className="draft-section-title">Funding &amp; Finance</div>
              <div className="draft-section-hint">Donor history, expenditure, proposed team, statutory compliance</div>
            </div>
            <span className="draft-collapsible-toggle">{finOpen ? '▲' : '▼'}</span>
          </div>
          {finOpen && (
            <div className="draft-collapsible-body">

              {/* Funding sources */}
              <div className="draft-dyn-label">Funding sources <span className="draft-dyn-unit">(₹ Lakhs)</span></div>
              {fundingRows.map(row => (
                <div key={row.id} className="draft-dyn-card">
                  <div className="draft-dyn-card-top">
                    <input className="draft-dyn-donor" placeholder="Donor / funder name"
                      value={row.donor} onChange={e => updFunding(row.id, 'donor', e.target.value)} />
                    <select value={row.grantType} onChange={e => updFunding(row.id, 'grantType', e.target.value)}>
                      <option value="">Type</option>
                      <option>Operational</option>
                      <option>Programme</option>
                      <option>Capital</option>
                      <option>Corpus</option>
                      <option>Other</option>
                    </select>
                    <select value={row.di} onChange={e => updFunding(row.id, 'di', e.target.value)}>
                      <option value="">D/I</option>
                      <option value="D">Domestic</option>
                      <option value="I">International</option>
                    </select>
                    <button className="draft-dyn-remove" onClick={() => setFundingRows(r => r.filter(x => x.id !== row.id))}>×</button>
                  </div>
                  <div className="draft-dyn-years">
                    {FUNDING_YEARS.map(([field, label]) => (
                      <div key={field} className="draft-dyn-year-cell">
                        <span className="draft-dyn-year-label">{label}</span>
                        <input className="draft-dyn-year-input" type="number" placeholder="—" step="0.1"
                          value={row[field]} onChange={e => updFunding(row.id, field, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button className="draft-dyn-add" onClick={() => setFundingRows(r => [...r, emptyFunding()])}>
                + Add donor
              </button>

              {/* Expenditure history */}
              <div className="draft-dyn-label" style={{ marginTop: 20 }}>
                Expenditure history <span className="draft-dyn-unit">(₹ Lakhs, excl. depreciation)</span>
              </div>
              <div className="draft-dyn-exp-header">
                <span className="draft-dyn-exp-fy-col">FY</span>
                <span>Salary</span>
                <span>Prog.</span>
                <span>Admin</span>
                <span>Capital</span>
                <span>Total</span>
                <span style={{ width: 24 }} />
              </div>
              {expenditureRows.map(row => (
                <div key={row.id} className="draft-dyn-exp-row">
                  <input className="draft-dyn-fy" placeholder="FY24-25" value={row.fy}
                    onChange={e => updExp(row.id, 'fy', e.target.value)} />
                  {(['salary', 'programme', 'admin', 'capital'] as const).map(field => (
                    <input key={field} className="draft-dyn-amt" type="number" placeholder="0" step="0.1"
                      value={row[field]} onChange={e => updExp(row.id, field, e.target.value)} />
                  ))}
                  <span className="draft-dyn-total">₹{expTotal(row).toFixed(1)}L</span>
                  <button className="draft-dyn-remove" onClick={() => setExpenditureRows(r => r.filter(x => x.id !== row.id))}>×</button>
                </div>
              ))}
              <button className="draft-dyn-add" onClick={() => setExpenditureRows(r => [...r, emptyExp()])}>
                + Add FY
              </button>

              {/* Proposed team */}
              <div className="draft-dyn-label" style={{ marginTop: 20 }}>
                Proposed team <span className="draft-dyn-unit">(this grant)</span>
              </div>
              {teamRows.map(row => (
                <div key={row.id} className="draft-dyn-team-row">
                  <input className="draft-dyn-designation" placeholder="Role / designation"
                    value={row.designation} onChange={e => updTeam(row.id, 'designation', e.target.value)} />
                  <input className="draft-dyn-fte" type="number" placeholder="FTE%" min="10" max="100" step="10"
                    value={row.fte} onChange={e => updTeam(row.id, 'fte', e.target.value)} />
                  <input className="draft-dyn-salary" type="number" placeholder="₹/mo" step="500"
                    value={row.monthlySalary} onChange={e => updTeam(row.id, 'monthlySalary', e.target.value)} />
                  {teamAnnual(row) && <span className="draft-dyn-total">₹{teamAnnual(row)}L/yr</span>}
                  <button className="draft-dyn-remove" onClick={() => setTeamRows(r => r.filter(x => x.id !== row.id))}>×</button>
                </div>
              ))}
              <button className="draft-dyn-add" onClick={() => setTeamRows(r => [...r, emptyTeam()])}>
                + Add team member
              </button>

              {/* Statutory compliance notes */}
              <div className="draft-field" style={{ marginTop: 20 }}>
                <label>Statutory compliance</label>
                <textarea className="draft-notes" rows={2}
                  placeholder="e.g. TDS current | PF current | ESI not applicable | ITR filed FY24-25 | No pending IT notices or TRACES dues"
                  value={statutoryNotes} onChange={e => setStatutoryNotes(e.target.value)} />
              </div>

            </div>
          )}
        </div>

        {/* ── Programme Design ────────────────────────────────────────────────── */}
        <div className="draft-section">
          <div className="draft-collapsible-header" onClick={() => setPddOpen(o => !o)}>
            <div>
              <div className="draft-section-title">Programme Design</div>
              <div className="draft-section-hint">Context, goal, history, effects, interventions, team — from the PDD</div>
            </div>
            <span className="draft-collapsible-toggle">{pddOpen ? '▲' : '▼'}</span>
          </div>
          {pddOpen && (
            <div className="draft-collapsible-body">
              <div className="draft-field">
                <label>Context</label>
                <textarea className="draft-notes" rows={4}
                  placeholder="The problem space — what communities face, what makes this geography particularly vulnerable…"
                  value={pdd.context} onChange={e => setPdd(p => ({ ...p, context: e.target.value }))} />
              </div>
              <div className="draft-field">
                <label>Goal</label>
                <textarea className="draft-notes" rows={2}
                  placeholder="The overarching goal of the programme…"
                  value={pdd.goal} onChange={e => setPdd(p => ({ ...p, goal: e.target.value }))} />
              </div>
              <div className="draft-field">
                <label>{meta.isRenewal ? 'Programme history & previous grant experience' : 'Programme history'}</label>
                <textarea className="draft-notes" rows={4}
                  placeholder="History of the programme, prior grant outcomes, achievements, what was learnt…"
                  value={pdd.historyWithFoundation} onChange={e => setPdd(p => ({ ...p, historyWithFoundation: e.target.value }))} />
              </div>

              <div className="draft-field">
                <label>Effects (intended outcomes)</label>
                <div className="draft-dyn-list">
                  {pdd.effects.map((effect, i) => (
                    <div key={i} className="draft-dyn-list-item">
                      <input placeholder={`Outcome ${i + 1}`} value={effect}
                        onChange={e => updEffect(i, e.target.value)} />
                      {pdd.effects.length > 1 && (
                        <button className="draft-dyn-remove"
                          onClick={() => setPdd(p => ({ ...p, effects: p.effects.filter((_, j) => j !== i) }))}>×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button className="draft-dyn-add"
                  onClick={() => setPdd(p => ({ ...p, effects: [...p.effects, ''] }))}>
                  + Add effect
                </button>
              </div>

              <div className="draft-field">
                <label>Key interventions</label>
                <div className="draft-dyn-list">
                  {pdd.keyInterventions.map((kv, i) => (
                    <div key={i} className="draft-dyn-list-item">
                      <input placeholder={`Intervention ${i + 1}`} value={kv}
                        onChange={e => updIntervention(i, e.target.value)} />
                      {pdd.keyInterventions.length > 1 && (
                        <button className="draft-dyn-remove"
                          onClick={() => setPdd(p => ({ ...p, keyInterventions: p.keyInterventions.filter((_, j) => j !== i) }))}>×</button>
                      )}
                    </div>
                  ))}
                </div>
                <button className="draft-dyn-add"
                  onClick={() => setPdd(p => ({ ...p, keyInterventions: [...p.keyInterventions, ''] }))}>
                  + Add intervention
                </button>
              </div>

              <div className="draft-field">
                <label>People involved</label>
                <textarea className="draft-notes" rows={4}
                  placeholder={`Programme (49): 1 Programme Lead, 16 Welfare Rights, 7 Youth Staff, 17 Children Staff…\nAdmin (2): 1 Accountant, 1 Office Assistant`}
                  value={pdd.peopleInvolved} onChange={e => setPdd(p => ({ ...p, peopleInvolved: e.target.value }))} />
              </div>
            </div>
          )}
        </div>

        {/* ── Upload ─────────────────────────────────────────────────────────── */}
        <div className="draft-section">
          <div className="draft-section-title">Upload documents</div>
          <div className="draft-section-hint">
            {isDesign
              ? 'Required for Design mode — Claude reads these directly to build the visual document'
              : 'Audit reports, annual reports, proposal, MIS data — supporting material for Claude to cross-reference'}
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

        {/* ── Our sense of the org ────────────────────────────────────────────── */}
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

      {/* Right panel — Draft mode only */}
      {!isDesign && (
        <div className={`draft-output${draft ? ' has-draft' : ''}`}>
          {!draft && !generating && (
            <div className="draft-output-empty">
              <div className="draft-output-empty-icon">◎</div>
              <div>Fill in the details on the left, then hit Generate.</div>
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
