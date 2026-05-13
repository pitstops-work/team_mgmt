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

// ─── Shared input styles ───────────────────────────────────────────────────────

const INPUT = 'border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-sky-400 w-full';
const TEXTAREA = 'border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400 w-full resize-y';
const SELECT = 'border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-sky-400 w-full bg-white';
const LABEL = 'text-xs font-medium text-stone-500';
const FIELD = 'flex flex-col gap-1';
const FIELD_ROW_CHILD = 'flex flex-col gap-1 flex-1 min-w-[120px]';
const CARD = 'bg-white border border-stone-200 rounded-xl p-4 mb-3';
const ADD_BTN = 'text-sm text-sky-600 hover:text-sky-700 font-medium mt-1 transition-colors';
const ADD_BTN_SM = 'text-xs text-sky-600 hover:text-sky-700 mt-1 transition-colors';
const REMOVE_BTN = 'text-xs text-stone-400 hover:text-red-500 transition-colors';
const SECTION_LABEL = 'text-xs font-semibold text-stone-600';
const SECTION_HINT = 'text-stone-400 font-normal';
const TABLE_INPUT = 'w-full bg-transparent text-xs text-center p-0.5 focus:outline-none focus:bg-sky-50 rounded border-0';

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

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-stone-400 text-sm">Loading…</div>
  );

  const stageIdx = STAGES.findIndex(s => s.id === currentStage);
  const isComplete = completedStages.includes(currentStage);

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex w-56 shrink-0 bg-white border-r border-stone-200 flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="px-4 py-4 border-b border-stone-100">
          <div className="font-semibold text-stone-900 text-sm leading-tight">{orgName}</div>
          {orgCity && <div className="text-xs text-stone-400 mt-0.5">{orgCity}</div>}
        </div>

        <nav className="flex-1 p-2 flex flex-col gap-0.5">
          {STAGES.map((s, i) => {
            const done = completedStages.includes(s.id);
            const active = s.id === currentStage;
            return (
              <button
                key={s.id}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  active ? 'bg-sky-50' : 'hover:bg-stone-50'
                }`}
                onClick={() => goTo(s.id)}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${
                  active ? 'bg-sky-600 text-white'
                  : done  ? 'bg-emerald-500 text-white'
                  : 'bg-stone-100 text-stone-500'
                }`}>
                  {done && !active ? '✓' : i + 1}
                </span>
                <span className={`text-sm truncate ${
                  active ? 'text-sky-700 font-medium'
                  : done  ? 'text-stone-700'
                  : 'text-stone-500'
                }`}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-stone-100 flex flex-col gap-2">
          <a href="/budget/new"
            className="block text-center text-xs px-3 py-2 rounded-lg border border-stone-200 text-stone-600 hover:border-sky-300 hover:text-sky-700 transition-colors no-underline">
            → Budget
          </a>
          <a href="/grant-notes/draft"
            className="block text-center text-xs px-3 py-2 rounded-lg border border-stone-200 text-stone-600 hover:border-sky-300 hover:text-sky-700 transition-colors no-underline">
            → Grant Note Draft
          </a>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 min-w-0 bg-stone-50 flex flex-col">
        {/* Mobile: org name + stage dropdown */}
        <div className="md:hidden bg-white border-b border-stone-200 px-4 py-3 flex items-center gap-3">
          <div className="text-sm font-semibold text-stone-900 truncate flex-1 min-w-0">{orgName}</div>
          <select
            className="text-sm border border-stone-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-sky-400 bg-white shrink-0 max-w-[160px]"
            value={currentStage}
            onChange={e => goTo(e.target.value)}
          >
            {STAGES.map((s, i) => (
              <option key={s.id} value={s.id}>
                {completedStages.includes(s.id) ? '✓' : `${i + 1}.`} {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sticky top-0 bg-stone-50 border-b border-stone-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 z-10 flex-wrap">
          <div>
            <div className="font-semibold text-stone-900">{STAGES[stageIdx]?.label}</div>
            <div className="text-xs text-stone-500 mt-0.5">{STAGES[stageIdx]?.hint}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {savedAt && <span className="text-xs text-stone-400">Saved {savedAt}</span>}
            <button
              className="px-4 py-2 text-sm bg-stone-100 text-stone-700 rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50"
              onClick={() => save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className={`px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                isComplete
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-sky-600 text-white hover:bg-sky-700'
              }`}
              onClick={() => save(!isComplete)} disabled={saving}>
              {isComplete ? '✓ Complete' : 'Mark complete'}
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-6 flex-1">
          {currentStage === 'org-profile'       && <OrgProfileForm data={orgProfile} onChange={setOrgProfile} />}
          {currentStage === 'governing-body'    && <GoverningBodyForm members={boardMembers} onChange={setBoardMembers} />}
          {currentStage === 'compliance'        && <ComplianceForm data={compliance} onChange={setCompliance} />}
          {currentStage === 'statutory-filings' && <StatutoryForm data={statutory} onChange={setStatutory} />}
          {currentStage === 'salary'            && <SalaryForm rows1={salary1} rows2={salary2} onChange1={setSalary1} onChange2={setSalary2} />}
          {currentStage === 'funding'           && <FundingForm rows={fundingRows} sectionB={sectionB} onChangeRows={setFundingRows} onChangeSectionB={setSectionB} />}
          {currentStage === 'expenditure'       && <ExpenditureForm data={expenditure} onChange={setExpenditure} />}
          {currentStage === 'pdd'               && <PddForm data={pdd} onChange={setPdd} />}
        </div>

        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-t border-stone-200 gap-3 flex-wrap">
          {stageIdx > 0 ? (
            <button
              className="px-4 py-2 text-sm bg-white border border-stone-200 text-stone-600 rounded-lg hover:border-sky-300 hover:text-sky-700 transition-colors"
              onClick={() => goTo(STAGES[stageIdx - 1].id)}>
              ← {STAGES[stageIdx - 1].label}
            </button>
          ) : <span />}
          {stageIdx < STAGES.length - 1 && (
            <button
              className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
              onClick={() => goTo(STAGES[stageIdx + 1].id)}>
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
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className={FIELD}><label className={LABEL}>Organisation name</label><input className={INPUT} value={data.name} onChange={set('name')} /></div>
      <div className={FIELD}><label className={LABEL}>Registered address</label><textarea className={TEXTAREA} rows={2} value={data.registeredAddress} onChange={set('registeredAddress')} /></div>
      <div className={FIELD}><label className={LABEL}>Administrative office address</label><textarea className={TEXTAREA} rows={2} value={data.adminOfficeAddress} onChange={set('adminOfficeAddress')} /></div>
      <div className={FIELD}><label className={LABEL}>Place where books of accounts are maintained</label><input className={INPUT} value={data.booksAddress} onChange={set('booksAddress')} /></div>
      <div className="flex gap-3 flex-wrap">
        <div className={FIELD_ROW_CHILD}>
          <label className={LABEL}>Registered as</label>
          <select className={SELECT} value={data.registrationType} onChange={set('registrationType')}>
            <option value="">Select</option>
            <option>Society</option><option>Trust</option><option>Section 8 Company</option>
          </select>
        </div>
        <div className={FIELD_ROW_CHILD}><label className={LABEL}>Registration number</label><input className={INPUT} value={data.registrationNumber} onChange={set('registrationNumber')} /></div>
        <div className={FIELD_ROW_CHILD}><label className={LABEL}>Registration date</label><input className={INPUT} value={data.registrationDate} onChange={set('registrationDate')} placeholder="DD/MM/YYYY" /></div>
      </div>
      <div className="flex gap-3 flex-wrap">
        <div className={FIELD_ROW_CHILD}><label className={LABEL}>PAN number</label><input className={INPUT} value={data.panNumber} onChange={set('panNumber')} /></div>
        <div className={FIELD_ROW_CHILD}><label className={LABEL}>PAN date</label><input className={INPUT} value={data.panDate} onChange={set('panDate')} placeholder="DD/MM/YYYY" /></div>
      </div>
      <div className="flex gap-3 flex-wrap">
        <div className={FIELD_ROW_CHILD}><label className={LABEL}>Chief functionary name</label><input className={INPUT} value={data.chiefFunctionaryName} onChange={set('chiefFunctionaryName')} /></div>
        <div className={FIELD_ROW_CHILD}><label className={LABEL}>Chief functionary contact</label><input className={INPUT} value={data.chiefFunctionaryContact} onChange={set('chiefFunctionaryContact')} /></div>
      </div>
      <div className="flex gap-3 flex-wrap">
        <div className={FIELD_ROW_CHILD}><label className={LABEL}>Finance person name</label><input className={INPUT} value={data.financePersonName} onChange={set('financePersonName')} /></div>
        <div className={FIELD_ROW_CHILD}><label className={LABEL}>Finance person contact</label><input className={INPUT} value={data.financePersonContact} onChange={set('financePersonContact')} /></div>
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
    <div className="flex flex-col gap-4 max-w-2xl">
      <p className="text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-lg p-3">
        Note: If any board member is associated with another institution, provide name, role, and since when (e.g. ABC is also Secretary of XYZ Trust since 2010).
      </p>
      {members.map((m, i) => (
        <div key={m.id} className={CARD}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-stone-500">Member {i + 1}</span>
            <button className={REMOVE_BTN} onClick={() => remove(m.id)}>Remove</button>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 flex-wrap">
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Name</label><input className={INPUT} value={m.name} onChange={e => update(m.id, 'name', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Role / Position</label><input className={INPUT} value={m.role} onChange={e => update(m.id, 'role', e.target.value)} /></div>
            </div>
            <div className={FIELD}><label className={LABEL}>Address & contact</label><input className={INPUT} value={m.addressContact} onChange={e => update(m.id, 'addressContact', e.target.value)} /></div>
            <div className="flex gap-3 flex-wrap">
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Relation to other members</label><input className={INPUT} value={m.relationToOthers} onChange={e => update(m.id, 'relationToOthers', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Tenure with board (years)</label><input className={INPUT} value={m.tenureBoard} onChange={e => update(m.id, 'tenureBoard', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Tenure in current position (years)</label><input className={INPUT} value={m.tenurePosition} onChange={e => update(m.id, 'tenurePosition', e.target.value)} /></div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Occupation</label><input className={INPUT} value={m.occupation} onChange={e => update(m.id, 'occupation', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Educational background</label><input className={INPUT} value={m.education} onChange={e => update(m.id, 'education', e.target.value)} /></div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Political exposure / affiliation</label><input className={INPUT} value={m.politicalExposure} onChange={e => update(m.id, 'politicalExposure', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Other institutions associated with</label><input className={INPUT} value={m.otherInstitutions} onChange={e => update(m.id, 'otherInstitutions', e.target.value)} /></div>
            </div>
            <div className={FIELD}><label className={LABEL}>Remarks</label><input className={INPUT} value={m.remarks} onChange={e => update(m.id, 'remarks', e.target.value)} /></div>
          </div>
        </div>
      ))}
      <button className={ADD_BTN} onClick={addMember}>+ Add board member</button>
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
      <div key={c.id} className={CARD}>
        <div className="font-medium text-stone-900 text-sm mb-3">{c.title}</div>
        {c.qs.map((q, qi) => (
          <div key={qi} className="flex flex-col gap-1 mb-3">
            <div className="text-xs text-stone-600">{q}</div>
            <input
              className={INPUT}
              placeholder="Response"
              value={data[section][c.id]?.responses?.[qi] || ''}
              onChange={e => setResponse(section, c.id, qi, e.target.value)}
            />
          </div>
        ))}
        <div className="flex flex-col gap-1 mt-2">
          <label className={LABEL}>Grant lead comments</label>
          <textarea className={TEXTAREA} rows={2} value={data[section][c.id]?.comments || ''} onChange={e => setComments(section, c.id, e.target.value)} />
        </div>
      </div>
    ));
  }

  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <div className={`${SECTION_LABEL} mb-1`}>Mandatory — must review</div>
      {renderGroup(MANDATORY_CHECKS, 'mandatory')}
      <div className={`${SECTION_LABEL} mt-4 mb-1`}>Recommended — not mandatory but important</div>
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

  const thLabel = 'px-3 py-2 text-left text-xs font-medium text-stone-600 bg-stone-50 border border-stone-200 whitespace-nowrap min-w-[150px]';
  const th = 'px-2 py-2 text-xs font-medium text-stone-600 bg-stone-50 border border-stone-200 whitespace-nowrap min-w-[72px] text-center';
  const tdLabel = 'px-3 py-1 text-xs text-stone-600 font-medium bg-stone-50 border border-stone-100 whitespace-nowrap';
  const td = 'border border-stone-100 p-0';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className={`${SECTION_LABEL} mb-2`}>Monthly filings <span className={SECTION_HINT}>(last 12 months)</span></div>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className={thLabel}>Particular</th>
                {MONTHS.map(m => <th key={m} className={th}>{m}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(([field, label]) => (
                <tr key={field}>
                  <td className={tdLabel}>{label}</td>
                  {(data as any)[field].map((v: string, i: number) => (
                    <td key={i} className={td}>
                      <input className={TABLE_INPUT} value={v} onChange={e => setGrid(field, i, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className={`${SECTION_LABEL} mb-2`}>Quarterly return filings</div>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className={thLabel}>Return</th>
                {QUARTERS.map(q => <th key={q} className={th}>{q}</th>)}
              </tr>
            </thead>
            <tbody>
              {[['quarterlyTds', 'TDS filing date'], ['quarterlyGst', 'GST filing date']].map(([f, l]) => (
                <tr key={f}>
                  <td className={tdLabel}>{l}</td>
                  {(data as any)[f].map((v: string, i: number) => (
                    <td key={i} className={td}>
                      <input className={TABLE_INPUT} value={v} onChange={e => setGrid(f, i, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className={`${SECTION_LABEL} mb-2`}>Annual return filings</div>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                {['Return', 'FY', 'Due date', 'Filing date', 'Remarks'].map(h => (
                  <th key={h} className={`${h === 'Return' ? thLabel : th} ${h === 'Remarks' ? 'min-w-[160px]' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['itr', 'Income Tax Return (ITR)'], ['pt', 'Professional Tax (PT)'],
                ['ros', 'Registrar of Societies / ROC'], ['fcra', 'FCRA (FC-4)'], ['gst', 'GST'],
              ].map(([key, label]) => (
                <tr key={key}>
                  <td className={tdLabel}>{label}</td>
                  {['fy', 'dueDate', 'filingDate', 'remarks'].map(f => (
                    <td key={f} className={td}>
                      <input className={TABLE_INPUT} value={(data.annualReturns as any)[key]?.[f] || ''} onChange={e => setAnnual(key, f, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className={`${SECTION_LABEL}`}>Table 1 — Existing staff consolidated salaries <span className={SECTION_HINT}>(latest month, ₹)</span></div>
      {rows1.map((row, i) => (
        <div key={row.id} className={CARD}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-stone-500">Staff {i + 1}</span>
            <button className={REMOVE_BTN} onClick={() => onChange1(rows1.filter(r => r.id !== row.id))}>Remove</button>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 flex-wrap">
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Name</label><input className={INPUT} value={row.name} onChange={e => upd1(row.id, 'name', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Designation</label><input className={INPUT} value={row.designation} onChange={e => upd1(row.id, 'designation', e.target.value)} /></div>
            </div>
            <div className="text-xs font-medium text-stone-500 mt-1">Salary from each donor (₹)</div>
            {row.donors.map((d, di) => (
              <div key={di} className="flex gap-2 flex-wrap">
                <div className={FIELD_ROW_CHILD}><label className={LABEL}>Donor {di + 1} name</label><input className={INPUT} value={d.name} onChange={e => updDonor(row.id, di, 'name', e.target.value)} /></div>
                <div className={FIELD_ROW_CHILD}><label className={LABEL}>Amount ₹</label><input className={INPUT} type="number" value={d.amount} onChange={e => updDonor(row.id, di, 'amount', e.target.value)} /></div>
              </div>
            ))}
            <button className={ADD_BTN_SM} onClick={() => updDonor(row.id, row.donors.length, 'name', '')}>+ Add donor source</button>
            <div className="flex gap-3 flex-wrap mt-1">
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>General fund ₹</label><input className={INPUT} type="number" value={row.generalFund} onChange={e => upd1(row.id, 'generalFund', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Total consolidated salary ₹</label><input className={INPUT} type="number" value={row.totalSalary} onChange={e => upd1(row.id, 'totalSalary', e.target.value)} /></div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {fields1.map(([f, l]) => (
                <div key={f} className="flex flex-col gap-1 flex-1 min-w-[90px]">
                  <label className={LABEL}>{l} ₹</label>
                  <input className={INPUT} type="number" value={(row as any)[f]} onChange={e => upd1(row.id, f, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      <button className={ADD_BTN} onClick={() => onChange1([...rows1, defaultSalaryRow1()])}>+ Add staff</button>

      <div className={`${SECTION_LABEL} mt-6`}>Table 2 — Proposed positions for this grant <span className={SECTION_HINT}>(₹/month)</span></div>
      {rows2.map((row, i) => (
        <div key={row.id} className={CARD}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-stone-500">Position {i + 1}</span>
            <button className={REMOVE_BTN} onClick={() => onChange2(rows2.filter(r => r.id !== row.id))}>Remove</button>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 flex-wrap">
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Name (if known)</label><input className={INPUT} value={row.name} onChange={e => upd2(row.id, 'name', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Designation / position</label><input className={INPUT} value={row.designation} onChange={e => upd2(row.id, 'designation', e.target.value)} /></div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Monthly consolidated salary ₹</label><input className={INPUT} type="number" value={row.monthlySalary} onChange={e => upd2(row.id, 'monthlySalary', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Salary range — min ₹</label><input className={INPUT} type="number" value={row.salaryRangeMin} onChange={e => upd2(row.id, 'salaryRangeMin', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Salary range — max ₹</label><input className={INPUT} type="number" value={row.salaryRangeMax} onChange={e => upd2(row.id, 'salaryRangeMax', e.target.value)} /></div>
            </div>
          </div>
        </div>
      ))}
      <button className={ADD_BTN} onClick={() => onChange2([...rows2, defaultSalaryRow2()])}>+ Add position</button>
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
    ['bankInterest', 'Bank interest'], ['rent', 'Rent'],
    ['incidentalIncome', 'Incidental income'], ['individualDonors', 'Individual donors'],
    ['other', 'Other (specify)'],
  ];

  const thLabel = 'px-3 py-2 text-left text-xs font-medium text-stone-600 bg-stone-50 border border-stone-200 whitespace-nowrap min-w-[140px]';
  const th = 'px-2 py-2 text-xs font-medium text-stone-600 bg-stone-50 border border-stone-200 whitespace-nowrap min-w-[80px] text-center';
  const tdLabel = 'px-3 py-1 text-xs text-stone-600 font-medium bg-stone-50 border border-stone-100 whitespace-nowrap';
  const td = 'border border-stone-100 p-0';

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className={SECTION_LABEL}>Section A — Donors / funders <span className={SECTION_HINT}>(₹, based on audited financials for past FYs)</span></div>
      {rows.map((row, i) => (
        <div key={row.id} className={CARD}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-stone-500">Funder {i + 1}</span>
            <button className={REMOVE_BTN} onClick={() => onChangeRows(rows.filter(r => r.id !== row.id))}>Remove</button>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 flex-wrap">
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Funder name (full form)</label><input className={INPUT} value={row.funderName} onChange={e => upd(row.id, 'funderName', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}>
                <label className={LABEL}>Funder type</label>
                <select className={SELECT} value={row.funderType} onChange={e => upd(row.id, 'funderType', e.target.value)}>
                  <option value="">Select</option>
                  <option>Foundation</option><option>CSR</option><option>Government</option>
                  <option>FCRA / International</option><option>Individual</option><option>Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Purpose of grant</label><input className={INPUT} value={row.purpose} onChange={e => upd(row.id, 'purpose', e.target.value)} /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>Start (month/year)</label><input className={INPUT} value={row.startDate} onChange={e => upd(row.id, 'startDate', e.target.value)} placeholder="Apr 2022" /></div>
              <div className={FIELD_ROW_CHILD}><label className={LABEL}>End (month/year)</label><input className={INPUT} value={row.endDate} onChange={e => upd(row.id, 'endDate', e.target.value)} placeholder="Mar 2027" /></div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {FY_COLS.map(([f, l]) => (
                <div key={f} className="flex flex-col gap-1 flex-1 min-w-[80px]">
                  <label className={LABEL}>{l} ₹</label>
                  <input className={INPUT} type="number" value={row[f]} onChange={e => upd(row.id, f, e.target.value)} />
                </div>
              ))}
            </div>
            <div className={FIELD}><label className={LABEL}>Remarks</label><input className={INPUT} value={row.remarks} onChange={e => upd(row.id, 'remarks', e.target.value)} /></div>
          </div>
        </div>
      ))}
      <button className={ADD_BTN} onClick={() => onChangeRows([...rows, defaultFundingRow()])}>+ Add funder</button>

      <div className={`${SECTION_LABEL} mt-4`}>Section B — Other income sources <span className={SECTION_HINT}>(₹)</span></div>
      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className={thLabel}>Source</th>
              {['FY22-23','FY23-24','FY24-25','FY25-26','FY26-27'].map(y => <th key={y} className={th}>{y}</th>)}
              <th className={`${th} min-w-[120px]`}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {sbRows.map(([key, label]) => (
              <tr key={key}>
                <td className={tdLabel}>{label}</td>
                {['fy2223','fy2324','fy2425','fy2526','fy2627'].map(f => (
                  <td key={f} className={td}>
                    <input className={TABLE_INPUT} type="number" value={(sectionB as any)[key]?.[f] || ''} onChange={e => setSB(key, f, e.target.value)} />
                  </td>
                ))}
                <td className={td}>
                  <input className={`${TABLE_INPUT} text-left px-2`} value={(sectionB as any)[key]?.remarks || ''} onChange={e => setSB(key, 'remarks', e.target.value)} />
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

  const thLabel = 'px-3 py-2 text-left text-xs font-medium text-stone-600 bg-stone-50 border border-stone-200 whitespace-nowrap min-w-[160px]';
  const th = 'px-2 py-2 text-xs font-medium text-stone-600 bg-stone-50 border border-stone-200 whitespace-nowrap min-w-[80px] text-center';
  const tdLabel = 'px-3 py-1 text-xs text-stone-600 font-medium bg-stone-50 border border-stone-100 whitespace-nowrap';
  const td = 'border border-stone-100 p-0';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className={`${SECTION_LABEL} mb-2`}>A. Overall organisation expenditure <span className={SECTION_HINT}>(₹, excl. depreciation unless noted)</span></div>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className={thLabel}>Item</th>
                <th className={th}>FY22-23</th><th className={th}>FY23-24</th>
                <th className={th}>FY24-25</th><th className={th}>FY25-26</th>
                <th className={th}>Current FY</th><th className={`${th} min-w-[100px]`}>As of date</th>
              </tr>
            </thead>
            <tbody>
              {EXP_ROWS.map(row => (
                <tr key={row}>
                  <td className={tdLabel}>{row}</td>
                  {['fy2223','fy2324','fy2425','fy2526','current'].map(f => (
                    <td key={f} className={td}>
                      <input className={TABLE_INPUT} type="number" value={(data.overall as any)[row]?.[f] || ''} onChange={e => setOverall(row, f, e.target.value)} />
                    </td>
                  ))}
                  <td className={td}>
                    <input className={TABLE_INPUT} placeholder="DD/MM/YYYY" value={(data.overall as any)[row]?.currentDate || ''} onChange={e => setOverall(row, 'currentDate', e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className={`${SECTION_LABEL} mb-2`}>B. Foundation-supported expenditure <span className={SECTION_HINT}>(₹)</span></div>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className={thLabel}>Item</th>
                <th className={th}>FY22-23</th><th className={th}>FY23-24</th>
                <th className={th}>FY24-25</th><th className={th}>FY25-26</th>
                <th className={th}>Current FY</th>
              </tr>
            </thead>
            <tbody>
              {FOUNDATION_EXP_ROWS.map(row => (
                <tr key={row}>
                  <td className={tdLabel}>{row}</td>
                  {['fy2223','fy2324','fy2425','fy2526','current'].map(f => (
                    <td key={f} className={td}>
                      <input className={TABLE_INPUT} type="number" value={(data.foundation as any)[row]?.[f] || ''} onChange={e => setFoundation(row, f, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1 mt-3">
          <label className={LABEL}>Sub-granting notes</label>
          <textarea className={TEXTAREA} rows={2} placeholder="Partner-wise grants released if applicable"
            value={data.foundationNotes} onChange={e => onChange({ ...data, foundationNotes: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

function PddForm({ data, onChange }: { data: ReturnType<typeof defaultPdd>; onChange: (d: any) => void }) {
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className={FIELD}>
        <label className={LABEL}>Context</label>
        <textarea className={TEXTAREA} rows={4} placeholder="The problem space — what communities face, what makes this geography particularly vulnerable…"
          value={data.context} onChange={e => onChange({ ...data, context: e.target.value })} />
      </div>
      <div className={FIELD}>
        <label className={LABEL}>Goal</label>
        <textarea className={TEXTAREA} rows={3} placeholder="The outcome this programme is working towards…"
          value={data.goal} onChange={e => onChange({ ...data, goal: e.target.value })} />
      </div>
      <div className={FIELD}>
        <label className={LABEL}>History with Foundation</label>
        <textarea className={TEXTAREA} rows={3} placeholder="Previous grants, relationship, what changed, what worked…"
          value={data.historyWithFoundation} onChange={e => onChange({ ...data, historyWithFoundation: e.target.value })} />
      </div>
      <div className={FIELD}>
        <label className={LABEL}>Effects <span className="text-stone-400 font-normal">(outcomes / changes in beneficiaries)</span></label>
        {data.effects.map((e, i) => (
          <div key={i} className="flex items-center gap-2 mb-1">
            <input className="flex-1 border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-sky-400" value={e} onChange={ev => {
              const arr = [...data.effects]; arr[i] = ev.target.value;
              onChange({ ...data, effects: arr });
            }} />
            {data.effects.length > 1 && (
              <button className="text-stone-400 hover:text-red-500 transition-colors shrink-0" onClick={() => onChange({ ...data, effects: data.effects.filter((_, j) => j !== i) })}>×</button>
            )}
          </div>
        ))}
        <button className={ADD_BTN_SM} onClick={() => onChange({ ...data, effects: [...data.effects, ''] })}>+ Add effect</button>
      </div>
      <div className={FIELD}>
        <label className={LABEL}>Key interventions</label>
        {data.keyInterventions.map((iv, i) => (
          <div key={i} className="flex items-center gap-2 mb-1">
            <input className="flex-1 border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-sky-400" value={iv} onChange={ev => {
              const arr = [...data.keyInterventions]; arr[i] = ev.target.value;
              onChange({ ...data, keyInterventions: arr });
            }} />
            {data.keyInterventions.length > 1 && (
              <button className="text-stone-400 hover:text-red-500 transition-colors shrink-0" onClick={() => onChange({ ...data, keyInterventions: data.keyInterventions.filter((_, j) => j !== i) })}>×</button>
            )}
          </div>
        ))}
        <button className={ADD_BTN_SM} onClick={() => onChange({ ...data, keyInterventions: [...data.keyInterventions, ''] })}>+ Add intervention</button>
      </div>
      <div className={FIELD}>
        <label className={LABEL}>People involved</label>
        <textarea className={TEXTAREA} rows={4}
          placeholder={`Programme (49): 1 Programme Lead, 16 Welfare Rights, 7 Youth Staff…\nAdmin (2): 1 Accountant, 1 Office Assistant`}
          value={data.peopleInvolved} onChange={e => onChange({ ...data, peopleInvolved: e.target.value })} />
      </div>
    </div>
  );
}
