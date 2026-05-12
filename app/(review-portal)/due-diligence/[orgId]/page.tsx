'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

type BoardMember = {
  id: string; name: string; role: string; addressContact: string;
  relationToOthers: string; tenureBoard: string; tenurePosition: string;
  occupation: string; education: string; politicalExposure: string;
  otherInstitutions: string; remarks: string;
};

type FundingRow = {
  id: string; funderName: string; funderType: string; purpose: string;
  startDate: string; endDate: string;
  fy2223: string; fy2324: string; fy2425: string; fy2526: string;
  fy2627: string; fy2728: string; fy2829: string; remarks: string;
};

type SalaryRow1 = {
  id: string; name: string; designation: string;
  donors: { name: string; amount: string }[];
  generalFund: string; totalSalary: string;
  pt: string; pfEmployee: string; esiEmployee: string; tds: string;
  netSalary: string; pfEmployer: string; esiEmployer: string;
  medicalInsurance: string; gratuity: string; totalCTC: string;
};

type SalaryRow2 = {
  id: string; name: string; designation: string;
  monthlySalary: string; salaryRangeMin: string; salaryRangeMax: string;
};

const newId = () => Math.random().toString(36).slice(2, 9);

const STAGES = [
  { id: 'org-profile',       label: 'Org Profile',         hint: 'Registration, contacts, addresses' },
  { id: 'governing-body',    label: 'Governing Body',       hint: 'Board members & profiles' },
  { id: 'compliance',        label: 'Compliance Checklist', hint: 'Mandatory & recommended checks' },
  { id: 'statutory-filings', label: 'Statutory Filings',    hint: 'TDS, PF, ESI, PT, GST monthly grid' },
  { id: 'salary',            label: 'Salary Details',       hint: 'Existing staff CTC + proposed roles' },
  { id: 'funding',           label: 'Funding & Income',     hint: 'Donors + other income FY22–29' },
  { id: 'expenditure',       label: 'Expenditure',          hint: 'Overall + Foundation-supported' },
  { id: 'pdd',               label: 'Programme Design',     hint: 'Context, goal, effects, interventions' },
];

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const QUARTERS = ['Q1 (Apr–Jun)', 'Q2 (Jul–Sep)', 'Q3 (Oct–Dec)', 'Q4 (Jan–Mar)'];
const FY_COLS: [keyof FundingRow, string][] = [
  ['fy2223', 'FY22-23'], ['fy2324', 'FY23-24'], ['fy2425', 'FY24-25'],
  ['fy2526', 'FY25-26'], ['fy2627', 'FY26-27'], ['fy2728', 'FY27-28'], ['fy2829', 'FY28-29'],
];
const EXP_ROWS = [
  'Salary Expenses', 'Programme Expenses', 'Admin Expenses',
  'Capital (Construction/Renovation)', 'One-time Relief Expenditure', 'Depreciation',
];
const FOUNDATION_EXP_ROWS = ['APF Grant Expenditure', 'Sub-granting / pass-through grants'];

const MANDATORY_CHECKS = [
  {
    id: 'registration',
    title: 'Registration Certificate + org rules',
    qs: ['Original and amended documents available?', 'Objectives align with proposed program, area of operation, dissolution & irrevocability clauses?'],
  },
  {
    id: '12a-80g',
    title: '12A and 80G',
    qs: ['12A & 80G certificates — Provisional / Permanent / Not Available?', 'If provisional or expiring, have they applied for renewal (Form 10AB)?'],
  },
  {
    id: 'pan',
    title: 'PAN card',
    qs: ['Registered date and PAN date are the same?', 'Org name and address match across all legal documents?'],
  },
  {
    id: 'board-meetings',
    title: 'Board / Trustee / General Body meetings',
    qs: ['Meeting minutes maintained and duly signed?', 'Meetings held per frequency in Trust Deed / Bye Laws / AoA?'],
  },
  {
    id: 'fcra',
    title: 'FCRA registration',
    qs: ['Registered under FCRA? If yes, validity till when?', 'If denied/cancelled — reasons, MHA responses, next steps?'],
  },
];

const RECOMMENDED_CHECKS = [
  {
    id: 'governance',
    title: 'Governance review',
    qs: ['Board members and count?', 'Any related members, political affiliation, POSH non-compliance, or criminal cases?', 'Family members / board members drawing salary or compensation?'],
  },
  {
    id: 'posh',
    title: 'POSH Policy & Internal Committee',
    qs: ['POSH policy in place?', 'Internal Committee (IC) constituted and displayed at workplace?'],
  },
  {
    id: 'affiliated',
    title: 'Affiliated / associated entities',
    qs: ['Organisation runs or is linked to another entity (sister concerns, business entity, MFI, trust, etc.)?', 'Do these linkages create any conflict of interest or compliance risk?'],
  },
  {
    id: 'books',
    title: 'Books of accounts',
    qs: ['Accounts maintained in-house or outsourced?', 'Accounting system used — Manual / Tally / other software?'],
  },
];

// ─── Defaults ─────────────────────────────────────────────────────────────────

function defaultOrgProfile() {
  return {
    name: '', registeredAddress: '', adminOfficeAddress: '',
    booksAddress: '', registrationType: '', registrationNumber: '',
    registrationDate: '', panNumber: '', panDate: '',
    chiefFunctionaryName: '', chiefFunctionaryContact: '',
    financePersonName: '', financePersonContact: '',
  };
}

function defaultCompliance() {
  const makeChecks = (arr: typeof MANDATORY_CHECKS) =>
    Object.fromEntries(arr.map(c => [c.id, { responses: c.qs.map(() => ''), comments: '' }]));
  return { mandatory: makeChecks(MANDATORY_CHECKS), recommended: makeChecks(RECOMMENDED_CHECKS) };
}

function defaultStatutory() {
  const grid = (rows: string[]) => Object.fromEntries(rows.map(r => [r, Array(12).fill('')]));
  return {
    tds192: Array(12).fill(''), tds194j: Array(12).fill(''), tds194c: Array(12).fill(''),
    tdsChallanDates: Array(12).fill(''),
    pfAmount: Array(12).fill(''), pfDate: Array(12).fill(''),
    esiAmount: Array(12).fill(''), esiDate: Array(12).fill(''),
    ptAmount: Array(12).fill(''), ptDate: Array(12).fill(''),
    gstAmount: Array(12).fill(''), gstDate: Array(12).fill(''),
    quarterlyTds: Array(4).fill(''), quarterlyGst: Array(4).fill(''),
    annualReturns: {
      itr: { fy: '', dueDate: '', filingDate: '', remarks: '' },
      pt:  { fy: '', dueDate: '', filingDate: '', remarks: '' },
      ros: { fy: '', dueDate: '', filingDate: '', remarks: '' },
      fcra:{ fy: '', dueDate: '', filingDate: '', remarks: '' },
      gst: { fy: '', dueDate: '', filingDate: '', remarks: '' },
    },
  };
}

function defaultSalaryRow1(): SalaryRow1 {
  return {
    id: newId(), name: '', designation: '',
    donors: [{ name: '', amount: '' }, { name: '', amount: '' }, { name: '', amount: '' }],
    generalFund: '', totalSalary: '',
    pt: '', pfEmployee: '', esiEmployee: '', tds: '',
    netSalary: '', pfEmployer: '', esiEmployer: '',
    medicalInsurance: '', gratuity: '', totalCTC: '',
  };
}

function defaultSalaryRow2(): SalaryRow2 {
  return { id: newId(), name: '', designation: '', monthlySalary: '', salaryRangeMin: '', salaryRangeMax: '' };
}

function defaultFundingRow(): FundingRow {
  return {
    id: newId(), funderName: '', funderType: '', purpose: '', startDate: '', endDate: '',
    fy2223: '', fy2324: '', fy2425: '', fy2526: '', fy2627: '', fy2728: '', fy2829: '', remarks: '',
  };
}

function defaultExpenditure() {
  const fy = { fy2223: '', fy2324: '', fy2425: '', fy2526: '', current: '', currentDate: '' };
  return {
    overall: Object.fromEntries(EXP_ROWS.map(r => [r, { ...fy }])),
    foundation: Object.fromEntries(FOUNDATION_EXP_ROWS.map(r => [r, { fy2223: '', fy2324: '', fy2425: '', fy2526: '', current: '' }])),
    foundationNotes: '',
  };
}

function defaultPdd() {
  return {
    context: '', goal: '', historyWithFoundation: '',
    effects: [''], keyInterventions: [''], peopleInvolved: '',
  };
}

function defaultSectionB() {
  const fy = { fy2223: '', fy2324: '', fy2425: '', fy2526: '', fy2627: '' };
  return {
    bankInterest: { ...fy }, rent: { ...fy }, incidentalIncome: { ...fy },
    individualDonors: { ...fy, remarks: '' }, other: { description: '', ...fy },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DueDiligencePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const currentStage = searchParams.get('stage') || 'org-profile';

  const [orgName, setOrgName] = useState('');
  const [orgCity, setOrgCity] = useState('');
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');

  // Stage data
  const [orgProfile, setOrgProfile] = useState(defaultOrgProfile());
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [compliance, setCompliance] = useState(defaultCompliance());
  const [statutory, setStatutory] = useState(defaultStatutory());
  const [salary1, setSalary1] = useState<SalaryRow1[]>([defaultSalaryRow1()]);
  const [salary2, setSalary2] = useState<SalaryRow2[]>([defaultSalaryRow2()]);
  const [fundingRows, setFundingRows] = useState<FundingRow[]>([defaultFundingRow()]);
  const [sectionB, setSectionB] = useState(defaultSectionB());
  const [expenditure, setExpenditure] = useState(defaultExpenditure());
  const [pdd, setPdd] = useState(defaultPdd());

  useEffect(() => {
    fetch(`/api/review/due-diligence/${orgId}`)
      .then(r => r.json())
      .then(d => {
        setOrgName(d.name || '');
        setOrgCity(d.city || '');
        setCompletedStages(d.completed_stages || []);
        if (d.org_profile && Object.keys(d.org_profile).length)   setOrgProfile(d.org_profile);
        if (d.governing_body?.length)                              setBoardMembers(d.governing_body);
        if (d.compliance_check && Object.keys(d.compliance_check).length) setCompliance(d.compliance_check);
        if (d.statutory_filings && Object.keys(d.statutory_filings).length) setStatutory(d.statutory_filings);
        if (d.salary_details?.table1?.length) setSalary1(d.salary_details.table1);
        if (d.salary_details?.table2?.length) setSalary2(d.salary_details.table2);
        if (d.funding_income?.sectionA?.length) setFundingRows(d.funding_income.sectionA);
        if (d.funding_income?.sectionB)         setSectionB(d.funding_income.sectionB);
        if (d.expenditure && Object.keys(d.expenditure).length) setExpenditure(d.expenditure);
        if (d.pdd && Object.keys(d.pdd).length) setPdd(d.pdd);
        setLoading(false);
      });
  }, [orgId]);

  const stageData = useCallback(() => {
    switch (currentStage) {
      case 'org-profile':       return orgProfile;
      case 'governing-body':    return boardMembers;
      case 'compliance':        return compliance;
      case 'statutory-filings': return statutory;
      case 'salary':            return { table1: salary1, table2: salary2 };
      case 'funding':           return { sectionA: fundingRows, sectionB };
      case 'expenditure':       return expenditure;
      case 'pdd':               return pdd;
      default: return {};
    }
  }, [currentStage, orgProfile, boardMembers, compliance, statutory, salary1, salary2, fundingRows, sectionB, expenditure, pdd]);

  async function save(markComplete?: boolean) {
    setSaving(true);
    await fetch(`/api/review/due-diligence/${orgId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: currentStage, data: stageData(), markComplete: markComplete ?? null }),
    });
    if (markComplete === true)  setCompletedStages(s => [...new Set([...s, currentStage])]);
    if (markComplete === false) setCompletedStages(s => s.filter(x => x !== currentStage));
    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString());
  }

  function goTo(stage: string) {
    router.push(`/due-diligence/${orgId}?stage=${stage}`);
  }

  if (loading) return <div className="dd-loading">Loading…</div>;

  const stageIdx = STAGES.findIndex(s => s.id === currentStage);
  const isComplete = completedStages.includes(currentStage);

  return (
    <div className="dd-app">
      {/* ── Sidebar ── */}
      <aside className="dd-sidebar">
        <div className="dd-sidebar-org">
          <div className="dd-sidebar-org-name">{orgName}</div>
          {orgCity && <div className="dd-sidebar-org-city">{orgCity}</div>}
        </div>

        <nav className="dd-stage-nav">
          {STAGES.map((s, i) => {
            const done = completedStages.includes(s.id);
            const active = s.id === currentStage;
            return (
              <button
                key={s.id}
                className={`dd-stage-item${active ? ' active' : ''}${done ? ' done' : ''}`}
                onClick={() => goTo(s.id)}
              >
                <span className="dd-stage-num">{done ? '✓' : i + 1}</span>
                <span className="dd-stage-label">{s.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="dd-sidebar-ctas">
          <a href="/budget/new" className="dd-cta-btn">→ Budget</a>
          <a href="/grant-notes/draft" className="dd-cta-btn">→ Grant Note Draft</a>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="dd-content">
        <div className="dd-content-header">
          <div>
            <div className="dd-content-title">{STAGES[stageIdx]?.label}</div>
            <div className="dd-content-hint">{STAGES[stageIdx]?.hint}</div>
          </div>
          <div className="dd-content-actions">
            {savedAt && <span className="dd-saved-at">Saved {savedAt}</span>}
            <button className="dd-save-btn" onClick={() => save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className={`dd-complete-btn${isComplete ? ' done' : ''}`}
              onClick={() => save(!isComplete)}
              disabled={saving}
            >
              {isComplete ? '✓ Complete' : 'Mark complete'}
            </button>
          </div>
        </div>

        <div className="dd-form-body">
          {currentStage === 'org-profile'       && <OrgProfileForm data={orgProfile} onChange={setOrgProfile} />}
          {currentStage === 'governing-body'    && <GoverningBodyForm members={boardMembers} onChange={setBoardMembers} />}
          {currentStage === 'compliance'        && <ComplianceForm data={compliance} onChange={setCompliance} />}
          {currentStage === 'statutory-filings' && <StatutoryForm data={statutory} onChange={setStatutory} />}
          {currentStage === 'salary'            && <SalaryForm rows1={salary1} rows2={salary2} onChange1={setSalary1} onChange2={setSalary2} />}
          {currentStage === 'funding'           && <FundingForm rows={fundingRows} sectionB={sectionB} onChangeRows={setFundingRows} onChangeSectionB={setSectionB} />}
          {currentStage === 'expenditure'       && <ExpenditureForm data={expenditure} onChange={setExpenditure} />}
          {currentStage === 'pdd'               && <PddForm data={pdd} onChange={setPdd} />}
        </div>

        <div className="dd-nav-footer">
          {stageIdx > 0 && (
            <button className="dd-nav-btn" onClick={() => goTo(STAGES[stageIdx - 1].id)}>
              ← {STAGES[stageIdx - 1].label}
            </button>
          )}
          {stageIdx < STAGES.length - 1 && (
            <button className="dd-nav-btn primary" onClick={() => goTo(STAGES[stageIdx + 1].id)}>
              {STAGES[stageIdx + 1].label} →
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Stage forms ──────────────────────────────────────────────────────────────

function OrgProfileForm({ data, onChange }: { data: ReturnType<typeof defaultOrgProfile>; onChange: (d: any) => void }) {
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...data, [k]: e.target.value });
  return (
    <div className="dd-stage-form">
      <div className="dd-field"><label>Organisation name</label><input value={data.name} onChange={set('name')} /></div>
      <div className="dd-field"><label>Registered address</label><textarea rows={2} value={data.registeredAddress} onChange={set('registeredAddress')} /></div>
      <div className="dd-field"><label>Administrative office address</label><textarea rows={2} value={data.adminOfficeAddress} onChange={set('adminOfficeAddress')} /></div>
      <div className="dd-field"><label>Place where books of accounts are maintained</label><input value={data.booksAddress} onChange={set('booksAddress')} /></div>
      <div className="dd-form-row">
        <div className="dd-field">
          <label>Registered as</label>
          <select value={data.registrationType} onChange={set('registrationType')}>
            <option value="">Select</option>
            <option>Society</option><option>Trust</option><option>Section 8 Company</option>
          </select>
        </div>
        <div className="dd-field"><label>Registration number</label><input value={data.registrationNumber} onChange={set('registrationNumber')} /></div>
        <div className="dd-field"><label>Registration date</label><input value={data.registrationDate} onChange={set('registrationDate')} placeholder="DD/MM/YYYY" /></div>
      </div>
      <div className="dd-form-row">
        <div className="dd-field"><label>PAN number</label><input value={data.panNumber} onChange={set('panNumber')} /></div>
        <div className="dd-field"><label>PAN date</label><input value={data.panDate} onChange={set('panDate')} placeholder="DD/MM/YYYY" /></div>
      </div>
      <div className="dd-form-row">
        <div className="dd-field"><label>Chief functionary name</label><input value={data.chiefFunctionaryName} onChange={set('chiefFunctionaryName')} /></div>
        <div className="dd-field"><label>Chief functionary contact</label><input value={data.chiefFunctionaryContact} onChange={set('chiefFunctionaryContact')} /></div>
      </div>
      <div className="dd-form-row">
        <div className="dd-field"><label>Finance person name</label><input value={data.financePersonName} onChange={set('financePersonName')} /></div>
        <div className="dd-field"><label>Finance person contact</label><input value={data.financePersonContact} onChange={set('financePersonContact')} /></div>
      </div>
    </div>
  );
}

function GoverningBodyForm({ members, onChange }: { members: BoardMember[]; onChange: (m: BoardMember[]) => void }) {
  function addMember() {
    onChange([...members, {
      id: newId(), name: '', role: '', addressContact: '', relationToOthers: '',
      tenureBoard: '', tenurePosition: '', occupation: '', education: '',
      politicalExposure: '', otherInstitutions: '', remarks: '',
    }]);
  }
  function update(id: string, field: keyof BoardMember, value: string) {
    onChange(members.map(m => m.id === id ? { ...m, [field]: value } : m));
  }
  function remove(id: string) { onChange(members.filter(m => m.id !== id)); }

  return (
    <div className="dd-stage-form">
      <p className="dd-table-note">Note: If any board member is associated with another institution, provide name, role, and since when (e.g. ABC is also Secretary of XYZ Trust since 2010).</p>
      {members.map((m, i) => (
        <div key={m.id} className="dd-board-card">
          <div className="dd-board-card-header">
            <span className="dd-board-num">Member {i + 1}</span>
            <button className="dd-remove-btn" onClick={() => remove(m.id)}>Remove</button>
          </div>
          <div className="dd-form-row">
            <div className="dd-field"><label>Name</label><input value={m.name} onChange={e => update(m.id, 'name', e.target.value)} /></div>
            <div className="dd-field"><label>Role / Position</label><input value={m.role} onChange={e => update(m.id, 'role', e.target.value)} /></div>
          </div>
          <div className="dd-field"><label>Address & contact</label><input value={m.addressContact} onChange={e => update(m.id, 'addressContact', e.target.value)} /></div>
          <div className="dd-form-row">
            <div className="dd-field"><label>Relation to other members</label><input value={m.relationToOthers} onChange={e => update(m.id, 'relationToOthers', e.target.value)} /></div>
            <div className="dd-field"><label>Tenure with board (years)</label><input value={m.tenureBoard} onChange={e => update(m.id, 'tenureBoard', e.target.value)} /></div>
            <div className="dd-field"><label>Tenure in current position (years)</label><input value={m.tenurePosition} onChange={e => update(m.id, 'tenurePosition', e.target.value)} /></div>
          </div>
          <div className="dd-form-row">
            <div className="dd-field"><label>Occupation</label><input value={m.occupation} onChange={e => update(m.id, 'occupation', e.target.value)} /></div>
            <div className="dd-field"><label>Educational background</label><input value={m.education} onChange={e => update(m.id, 'education', e.target.value)} /></div>
          </div>
          <div className="dd-form-row">
            <div className="dd-field"><label>Political exposure / affiliation</label><input value={m.politicalExposure} onChange={e => update(m.id, 'politicalExposure', e.target.value)} /></div>
            <div className="dd-field"><label>Other institutions associated with</label><input value={m.otherInstitutions} onChange={e => update(m.id, 'otherInstitutions', e.target.value)} /></div>
          </div>
          <div className="dd-field"><label>Remarks</label><input value={m.remarks} onChange={e => update(m.id, 'remarks', e.target.value)} /></div>
        </div>
      ))}
      <button className="dd-add-btn" onClick={addMember}>+ Add board member</button>
    </div>
  );
}

function ComplianceForm({ data, onChange }: { data: ReturnType<typeof defaultCompliance>; onChange: (d: any) => void }) {
  function setResponse(section: 'mandatory' | 'recommended', id: string, qi: number, value: string) {
    const responses = [...(data[section][id]?.responses || [])];
    responses[qi] = value;
    onChange({ ...data, [section]: { ...data[section], [id]: { ...data[section][id], responses } } });
  }
  function setComments(section: 'mandatory' | 'recommended', id: string, value: string) {
    onChange({ ...data, [section]: { ...data[section], [id]: { ...data[section][id], comments: value } } });
  }

  function renderGroup(checks: typeof MANDATORY_CHECKS, section: 'mandatory' | 'recommended') {
    return checks.map(c => (
      <div key={c.id} className="dd-check-card">
        <div className="dd-check-title">{c.title}</div>
        {c.qs.map((q, qi) => (
          <div key={qi} className="dd-check-row">
            <div className="dd-check-question">{q}</div>
            <input
              className="dd-check-response"
              placeholder="Response"
              value={data[section][c.id]?.responses?.[qi] || ''}
              onChange={e => setResponse(section, c.id, qi, e.target.value)}
            />
          </div>
        ))}
        <div className="dd-field" style={{ marginTop: 8 }}>
          <label>Grant lead comments</label>
          <textarea rows={2} value={data[section][c.id]?.comments || ''} onChange={e => setComments(section, c.id, e.target.value)} />
        </div>
      </div>
    ));
  }

  return (
    <div className="dd-stage-form">
      <div className="dd-check-section-label">Mandatory — must review</div>
      {renderGroup(MANDATORY_CHECKS, 'mandatory')}
      <div className="dd-check-section-label" style={{ marginTop: 24 }}>Recommended — not mandatory but important</div>
      {renderGroup(RECOMMENDED_CHECKS, 'recommended')}
    </div>
  );
}

function StatutoryForm({ data, onChange }: { data: ReturnType<typeof defaultStatutory>; onChange: (d: any) => void }) {
  function setGrid(field: string, i: number, value: string) {
    const arr = [...(data as any)[field]];
    arr[i] = value;
    onChange({ ...data, [field]: arr });
  }
  function setAnnual(key: string, field: string, value: string) {
    onChange({ ...data, annualReturns: { ...data.annualReturns, [key]: { ...(data.annualReturns as any)[key], [field]: value } } });
  }

  const rows: [string, string][] = [
    ['tds192', 'TDS 192 (₹)'], ['tds194j', 'TDS 194J (₹)'], ['tds194c', 'TDS 194C (₹)'],
    ['tdsChallanDates', 'TDS challan date'],
    ['pfAmount', 'PF amount (₹)'], ['pfDate', 'PF payment date'],
    ['esiAmount', 'ESI amount (₹)'], ['esiDate', 'ESI payment date'],
    ['ptAmount', 'PT amount (₹)'], ['ptDate', 'PT payment date'],
    ['gstAmount', 'GST amount (₹)'], ['gstDate', 'GST payment date'],
  ];

  return (
    <div className="dd-stage-form">
      <div className="dd-table-label">Monthly filings <span className="dd-table-hint">(last 12 months)</span></div>
      <div className="dd-stat-scroll">
        <table className="dd-stat-table">
          <thead>
            <tr>
              <th className="dd-stat-th-label">Particular</th>
              {MONTHS.map(m => <th key={m} className="dd-stat-th">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([field, label]) => (
              <tr key={field}>
                <td className="dd-stat-td-label">{label}</td>
                {(data as any)[field].map((v: string, i: number) => (
                  <td key={i} className="dd-stat-td">
                    <input className="dd-stat-input" value={v} onChange={e => setGrid(field, i, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dd-table-label" style={{ marginTop: 20 }}>Quarterly return filings</div>
      <div className="dd-stat-scroll">
        <table className="dd-stat-table">
          <thead>
            <tr>
              <th className="dd-stat-th-label">Return</th>
              {QUARTERS.map(q => <th key={q} className="dd-stat-th">{q}</th>)}
            </tr>
          </thead>
          <tbody>
            {[['quarterlyTds', 'TDS filing date'], ['quarterlyGst', 'GST filing date']].map(([f, l]) => (
              <tr key={f}>
                <td className="dd-stat-td-label">{l}</td>
                {(data as any)[f].map((v: string, i: number) => (
                  <td key={i} className="dd-stat-td">
                    <input className="dd-stat-input" value={v} onChange={e => setGrid(f, i, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dd-table-label" style={{ marginTop: 20 }}>Annual return filings</div>
      <table className="dd-annual-table">
        <thead>
          <tr><th>Return</th><th>FY</th><th>Due date</th><th>Filing date</th><th>Remarks</th></tr>
        </thead>
        <tbody>
          {[['itr', 'Income Tax Return (ITR)'], ['pt', 'Professional Tax (PT)'], ['ros', 'Registrar of Societies / ROC'], ['fcra', 'FCRA (FC-4)'], ['gst', 'GST']].map(([key, label]) => (
            <tr key={key}>
              <td className="dd-annual-label">{label}</td>
              {['fy', 'dueDate', 'filingDate', 'remarks'].map(f => (
                <td key={f}><input className="dd-annual-input" value={(data.annualReturns as any)[key]?.[f] || ''} onChange={e => setAnnual(key, f, e.target.value)} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SalaryForm({ rows1, rows2, onChange1, onChange2 }: {
  rows1: SalaryRow1[]; rows2: SalaryRow2[];
  onChange1: (r: SalaryRow1[]) => void; onChange2: (r: SalaryRow2[]) => void;
}) {
  function upd1(id: string, field: string, value: string) {
    onChange1(rows1.map(r => r.id === id ? { ...r, [field]: value } : r));
  }
  function updDonor(id: string, di: number, field: string, value: string) {
    onChange1(rows1.map(r => {
      if (r.id !== id) return r;
      const donors = r.donors.map((d, i) => i === di ? { ...d, [field]: value } : d);
      return { ...r, donors };
    }));
  }
  function upd2(id: string, field: keyof SalaryRow2, value: string) {
    onChange2(rows2.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  const fields1: [string, string][] = [
    ['pt', 'PT'], ['pfEmployee', 'PF (employee)'], ['esiEmployee', 'ESI (employee)'],
    ['tds', 'TDS'], ['netSalary', 'Net salary'], ['pfEmployer', 'PF (employer)'],
    ['esiEmployer', 'ESI (employer)'], ['medicalInsurance', 'Medical insurance'],
    ['gratuity', 'Gratuity'], ['totalCTC', 'Total CTC'],
  ];

  return (
    <div className="dd-stage-form">
      <div className="dd-table-label">Table 1 — Existing staff consolidated salaries <span className="dd-table-hint">(latest month, ₹)</span></div>
      {rows1.map((row, i) => (
        <div key={row.id} className="dd-salary-card">
          <div className="dd-board-card-header">
            <span className="dd-board-num">Staff {i + 1}</span>
            <button className="dd-remove-btn" onClick={() => onChange1(rows1.filter(r => r.id !== row.id))}>Remove</button>
          </div>
          <div className="dd-form-row">
            <div className="dd-field"><label>Name</label><input value={row.name} onChange={e => upd1(row.id, 'name', e.target.value)} /></div>
            <div className="dd-field"><label>Designation</label><input value={row.designation} onChange={e => upd1(row.id, 'designation', e.target.value)} /></div>
          </div>
          <div className="dd-table-label" style={{ fontSize: 11, marginTop: 8 }}>Salary from each donor (₹)</div>
          {row.donors.map((d, di) => (
            <div key={di} className="dd-form-row" style={{ gap: 8 }}>
              <div className="dd-field"><label>Donor {di + 1} name</label><input value={d.name} onChange={e => updDonor(row.id, di, 'name', e.target.value)} /></div>
              <div className="dd-field"><label>Amount ₹</label><input type="number" value={d.amount} onChange={e => updDonor(row.id, di, 'amount', e.target.value)} /></div>
            </div>
          ))}
          <button className="dd-add-btn small" onClick={() => updDonor(row.id, row.donors.length, 'name', '')}>+ Add donor source</button>
          <div className="dd-form-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <div className="dd-field"><label>General fund ₹</label><input type="number" value={row.generalFund} onChange={e => upd1(row.id, 'generalFund', e.target.value)} /></div>
            <div className="dd-field"><label>Total consolidated salary ₹</label><input type="number" value={row.totalSalary} onChange={e => upd1(row.id, 'totalSalary', e.target.value)} /></div>
          </div>
          <div className="dd-form-row" style={{ flexWrap: 'wrap' }}>
            {fields1.map(([f, l]) => (
              <div key={f} className="dd-field small"><label>{l} ₹</label><input type="number" value={(row as any)[f]} onChange={e => upd1(row.id, f, e.target.value)} /></div>
            ))}
          </div>
        </div>
      ))}
      <button className="dd-add-btn" onClick={() => onChange1([...rows1, defaultSalaryRow1()])}>+ Add staff</button>

      <div className="dd-table-label" style={{ marginTop: 28 }}>Table 2 — Proposed positions for this grant <span className="dd-table-hint">(₹/month)</span></div>
      {rows2.map((row, i) => (
        <div key={row.id} className="dd-salary-card">
          <div className="dd-board-card-header">
            <span className="dd-board-num">Position {i + 1}</span>
            <button className="dd-remove-btn" onClick={() => onChange2(rows2.filter(r => r.id !== row.id))}>Remove</button>
          </div>
          <div className="dd-form-row">
            <div className="dd-field"><label>Name (if known)</label><input value={row.name} onChange={e => upd2(row.id, 'name', e.target.value)} /></div>
            <div className="dd-field"><label>Designation / position</label><input value={row.designation} onChange={e => upd2(row.id, 'designation', e.target.value)} /></div>
          </div>
          <div className="dd-form-row">
            <div className="dd-field"><label>Monthly consolidated salary ₹</label><input type="number" value={row.monthlySalary} onChange={e => upd2(row.id, 'monthlySalary', e.target.value)} /></div>
            <div className="dd-field"><label>Salary range — min ₹</label><input type="number" value={row.salaryRangeMin} onChange={e => upd2(row.id, 'salaryRangeMin', e.target.value)} /></div>
            <div className="dd-field"><label>Salary range — max ₹</label><input type="number" value={row.salaryRangeMax} onChange={e => upd2(row.id, 'salaryRangeMax', e.target.value)} /></div>
          </div>
        </div>
      ))}
      <button className="dd-add-btn" onClick={() => onChange2([...rows2, defaultSalaryRow2()])}>+ Add position</button>
    </div>
  );
}

function FundingForm({ rows, sectionB, onChangeRows, onChangeSectionB }: {
  rows: FundingRow[]; sectionB: ReturnType<typeof defaultSectionB>;
  onChangeRows: (r: FundingRow[]) => void; onChangeSectionB: (b: any) => void;
}) {
  function upd(id: string, field: keyof FundingRow, value: string) {
    onChangeRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  }
  function setSB(key: string, field: string, value: string) {
    onChangeSectionB({ ...sectionB, [key]: { ...(sectionB as any)[key], [field]: value } });
  }

  const sbRows: [string, string][] = [
    ['bankInterest', 'Bank interest'],
    ['rent', 'Rent'],
    ['incidentalIncome', 'Incidental income'],
    ['individualDonors', 'Individual donors'],
    ['other', 'Other (specify)'],
  ];
  const fyFields: (keyof FundingRow)[] = ['fy2223', 'fy2324', 'fy2425', 'fy2526', 'fy2627', 'fy2728', 'fy2829'];

  return (
    <div className="dd-stage-form">
      <div className="dd-table-label">Section A — Donors / funders <span className="dd-table-hint">(₹, based on audited financials for past FYs)</span></div>
      {rows.map((row, i) => (
        <div key={row.id} className="dd-salary-card">
          <div className="dd-board-card-header">
            <span className="dd-board-num">Funder {i + 1}</span>
            <button className="dd-remove-btn" onClick={() => onChangeRows(rows.filter(r => r.id !== row.id))}>Remove</button>
          </div>
          <div className="dd-form-row">
            <div className="dd-field"><label>Funder name (full form)</label><input value={row.funderName} onChange={e => upd(row.id, 'funderName', e.target.value)} /></div>
            <div className="dd-field">
              <label>Funder type</label>
              <select value={row.funderType} onChange={e => upd(row.id, 'funderType', e.target.value)}>
                <option value="">Select</option>
                <option>Foundation</option><option>CSR</option><option>Government</option>
                <option>FCRA / International</option><option>Individual</option><option>Other</option>
              </select>
            </div>
          </div>
          <div className="dd-form-row">
            <div className="dd-field"><label>Purpose of grant</label><input value={row.purpose} onChange={e => upd(row.id, 'purpose', e.target.value)} /></div>
            <div className="dd-field"><label>Start (month/year)</label><input value={row.startDate} onChange={e => upd(row.id, 'startDate', e.target.value)} placeholder="Apr 2022" /></div>
            <div className="dd-field"><label>End (month/year)</label><input value={row.endDate} onChange={e => upd(row.id, 'endDate', e.target.value)} placeholder="Mar 2027" /></div>
          </div>
          <div className="dd-form-row" style={{ flexWrap: 'wrap' }}>
            {FY_COLS.map(([f, l]) => (
              <div key={f} className="dd-field small"><label>{l} ₹</label><input type="number" value={row[f]} onChange={e => upd(row.id, f, e.target.value)} /></div>
            ))}
          </div>
          <div className="dd-field"><label>Remarks</label><input value={row.remarks} onChange={e => upd(row.id, 'remarks', e.target.value)} /></div>
        </div>
      ))}
      <button className="dd-add-btn" onClick={() => onChangeRows([...rows, defaultFundingRow()])}>+ Add funder</button>

      <div className="dd-table-label" style={{ marginTop: 28 }}>Section B — Other income sources <span className="dd-table-hint">(₹)</span></div>
      <div className="dd-stat-scroll">
        <table className="dd-stat-table">
          <thead>
            <tr>
              <th className="dd-stat-th-label">Source</th>
              {['FY22-23','FY23-24','FY24-25','FY25-26','FY26-27'].map(y => <th key={y} className="dd-stat-th">{y}</th>)}
              <th className="dd-stat-th">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {sbRows.map(([key, label]) => (
              <tr key={key}>
                <td className="dd-stat-td-label">{label}</td>
                {['fy2223','fy2324','fy2425','fy2526','fy2627'].map(f => (
                  <td key={f} className="dd-stat-td">
                    <input className="dd-stat-input" type="number" value={(sectionB as any)[key]?.[f] || ''} onChange={e => setSB(key, f, e.target.value)} />
                  </td>
                ))}
                <td className="dd-stat-td">
                  <input className="dd-stat-input wide" value={(sectionB as any)[key]?.remarks || ''} onChange={e => setSB(key, 'remarks', e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpenditureForm({ data, onChange }: { data: ReturnType<typeof defaultExpenditure>; onChange: (d: any) => void }) {
  function setOverall(row: string, field: string, value: string) {
    onChange({ ...data, overall: { ...data.overall, [row]: { ...data.overall[row], [field]: value } } });
  }
  function setFoundation(row: string, field: string, value: string) {
    onChange({ ...data, foundation: { ...data.foundation, [row]: { ...(data.foundation as any)[row], [field]: value } } });
  }

  return (
    <div className="dd-stage-form">
      <div className="dd-table-label">A. Overall organisation expenditure <span className="dd-table-hint">(₹, excl. depreciation unless noted)</span></div>
      <div className="dd-stat-scroll">
        <table className="dd-stat-table">
          <thead>
            <tr>
              <th className="dd-stat-th-label">Item</th>
              <th className="dd-stat-th">FY22-23</th><th className="dd-stat-th">FY23-24</th>
              <th className="dd-stat-th">FY24-25</th><th className="dd-stat-th">FY25-26</th>
              <th className="dd-stat-th">Current FY</th><th className="dd-stat-th">As of date</th>
            </tr>
          </thead>
          <tbody>
            {EXP_ROWS.map(row => (
              <tr key={row}>
                <td className="dd-stat-td-label">{row}</td>
                {['fy2223','fy2324','fy2425','fy2526','current'].map(f => (
                  <td key={f} className="dd-stat-td">
                    <input className="dd-stat-input" type={f === 'currentDate' ? 'text' : 'number'} value={(data.overall as any)[row]?.[f] || ''} onChange={e => setOverall(row, f, e.target.value)} />
                  </td>
                ))}
                <td className="dd-stat-td">
                  <input className="dd-stat-input" placeholder="DD/MM/YYYY" value={(data.overall as any)[row]?.currentDate || ''} onChange={e => setOverall(row, 'currentDate', e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="dd-table-label" style={{ marginTop: 20 }}>B. Foundation-supported expenditure <span className="dd-table-hint">(₹)</span></div>
      <div className="dd-stat-scroll">
        <table className="dd-stat-table">
          <thead>
            <tr>
              <th className="dd-stat-th-label">Item</th>
              <th className="dd-stat-th">FY22-23</th><th className="dd-stat-th">FY23-24</th>
              <th className="dd-stat-th">FY24-25</th><th className="dd-stat-th">FY25-26</th>
              <th className="dd-stat-th">Current FY</th>
            </tr>
          </thead>
          <tbody>
            {FOUNDATION_EXP_ROWS.map(row => (
              <tr key={row}>
                <td className="dd-stat-td-label">{row}</td>
                {['fy2223','fy2324','fy2425','fy2526','current'].map(f => (
                  <td key={f} className="dd-stat-td">
                    <input className="dd-stat-input" type="number" value={(data.foundation as any)[row]?.[f] || ''} onChange={e => setFoundation(row, f, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dd-field" style={{ marginTop: 12 }}>
        <label>Sub-granting notes</label>
        <textarea rows={2} placeholder="Partner-wise grants released if applicable"
          value={data.foundationNotes} onChange={e => onChange({ ...data, foundationNotes: e.target.value })} />
      </div>
    </div>
  );
}

function PddForm({ data, onChange }: { data: ReturnType<typeof defaultPdd>; onChange: (d: any) => void }) {
  return (
    <div className="dd-stage-form">
      <div className="dd-field">
        <label>Context</label>
        <textarea rows={4} placeholder="The problem space — what communities face, what makes this geography particularly vulnerable…"
          value={data.context} onChange={e => onChange({ ...data, context: e.target.value })} />
      </div>
      <div className="dd-field">
        <label>Goal</label>
        <textarea rows={3} placeholder="The outcome this programme is working towards…"
          value={data.goal} onChange={e => onChange({ ...data, goal: e.target.value })} />
      </div>
      <div className="dd-field">
        <label>History with Foundation</label>
        <textarea rows={3} placeholder="Previous grants, relationship, what changed, what worked…"
          value={data.historyWithFoundation} onChange={e => onChange({ ...data, historyWithFoundation: e.target.value })} />
      </div>
      <div className="dd-field">
        <label>Effects <span className="dd-table-hint">(outcomes / changes in beneficiaries)</span></label>
        {data.effects.map((e, i) => (
          <div key={i} className="dd-list-input-row">
            <input value={e} onChange={ev => {
              const arr = [...data.effects]; arr[i] = ev.target.value;
              onChange({ ...data, effects: arr });
            }} />
            {data.effects.length > 1 && (
              <button className="dd-remove-btn small" onClick={() => onChange({ ...data, effects: data.effects.filter((_, j) => j !== i) })}>×</button>
            )}
          </div>
        ))}
        <button className="dd-add-btn small" onClick={() => onChange({ ...data, effects: [...data.effects, ''] })}>+ Add effect</button>
      </div>
      <div className="dd-field">
        <label>Key interventions</label>
        {data.keyInterventions.map((iv, i) => (
          <div key={i} className="dd-list-input-row">
            <input value={iv} onChange={ev => {
              const arr = [...data.keyInterventions]; arr[i] = ev.target.value;
              onChange({ ...data, keyInterventions: arr });
            }} />
            {data.keyInterventions.length > 1 && (
              <button className="dd-remove-btn small" onClick={() => onChange({ ...data, keyInterventions: data.keyInterventions.filter((_, j) => j !== i) })}>×</button>
            )}
          </div>
        ))}
        <button className="dd-add-btn small" onClick={() => onChange({ ...data, keyInterventions: [...data.keyInterventions, ''] })}>+ Add intervention</button>
      </div>
      <div className="dd-field">
        <label>People involved</label>
        <textarea rows={4}
          placeholder={`Programme (49): 1 Programme Lead, 16 Welfare Rights, 7 Youth Staff…\nAdmin (2): 1 Accountant, 1 Office Assistant`}
          value={data.peopleInvolved} onChange={e => onChange({ ...data, peopleInvolved: e.target.value })} />
      </div>
    </div>
  );
}
