import * as XLSX from 'xlsx';

export type BudgetSummary = {
  categories: { name: string; yearlyTotals: number[]; grantTotal: number; pct: number }[];
  grandTotal: number;
  years: number;
};

export type BudgetLineItem = {
  sno: string;
  description: string;
  category: string;
  unitType: string;
  unitCost: number;
  yearTotals: number[];
  total: number;
  notes: string;
  budgetFor: string;
};

export type BudgetData = {
  summary: BudgetSummary;
  programStaff: BudgetLineItem[];
  adminStaff: BudgetLineItem[];
  fixedAssets: BudgetLineItem[];
  travel: BudgetLineItem[];
  programExpenses: BudgetLineItem[];
  adminCost: BudgetLineItem[];
  raw: string;
};

const CATEGORY_LABELS: Record<number, string> = {
  1: 'Salary / Honorarium / Staff benefits',
  2: 'Fixed Assets / CAPEX',
  3: 'Travel, Boarding & Lodging',
  4: 'Program expenses',
  5: 'Administration cost',
};

export function parseBudgetExcel(buffer: Buffer): BudgetData {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const summarySheet = wb.Sheets['02.Summary'];
  const summaryRows: any[][] = XLSX.utils.sheet_to_json(summarySheet, { header: 1, defval: null });

  const categories: BudgetSummary['categories'] = [];
  let grandTotal = 0;
  let years = 3;

  for (const row of summaryRows) {
    const slNo = row[1];
    if (typeof slNo !== 'number' || slNo < 1 || slNo > 5) continue;
    const name = CATEGORY_LABELS[slNo] || String(row[2] || '');
    const yearlyTotals = [row[3], row[4], row[5], row[6], row[7]].map(v => typeof v === 'number' ? v : 0).filter(v => v > 0);
    const grantTotal = typeof row[8] === 'number' ? row[8] : 0;
    const pct = typeof row[9] === 'number' ? row[9] : 0;
    if (grantTotal > 0) {
      categories.push({ name, yearlyTotals, grantTotal, pct });
      grandTotal += grantTotal;
      years = Math.max(years, yearlyTotals.length);
    }
  }

  const budgetSheet = wb.Sheets['03.Budget'];
  const budgetRows: any[][] = XLSX.utils.sheet_to_json(budgetSheet, { header: 1, defval: null });

  const programStaff: BudgetLineItem[] = [];
  const adminStaff: BudgetLineItem[] = [];
  const fixedAssets: BudgetLineItem[] = [];
  const travel: BudgetLineItem[] = [];
  const programExpenses: BudgetLineItem[] = [];
  const adminCost: BudgetLineItem[] = [];

  let currentSection = '';

  for (const row of budgetRows) {
    const first = row[0];
    const second = row[1];
    if (first === 'a' || (typeof first === 'number' && first === 1 && second === 'Salary, Honorarium, Staff benefits')) currentSection = 'salary-program';
    if (first === 'b') currentSection = 'salary-admin';
    if (typeof first === 'number' && first === 2 && String(second || '').includes('Fixed')) currentSection = 'fixed';
    if (typeof first === 'number' && first === 3 && String(second || '').includes('Travel')) currentSection = 'travel';
    if (typeof first === 'number' && first === 4 && String(second || '').includes('Program')) currentSection = 'program';
    if (typeof first === 'number' && first === 5 && String(second || '').includes('Admin')) currentSection = 'admin';

    if (typeof first !== 'number' || !second) continue;
    const description = String(second).replace(/\n/g, ' ').trim();
    if (!description) continue;

    const item: BudgetLineItem = {
      sno: String(first),
      description,
      category: currentSection,
      unitType: String(row[4] || ''),
      unitCost: typeof row[6] === 'number' ? row[6] : 0,
      yearTotals: [row[8], row[12], row[16], row[20], row[24]].map(v => typeof v === 'number' ? v : 0).filter(v => v > 0),
      total: typeof row[25] === 'number' ? row[25] : 0,
      notes: String(row[26] || '').replace(/\n/g, ' ').trim(),
      budgetFor: String(row[29] || '').trim(),
    };

    if (item.total === 0 && item.unitCost === 0) continue;

    switch (currentSection) {
      case 'salary-program': programStaff.push(item); break;
      case 'salary-admin': adminStaff.push(item); break;
      case 'fixed': fixedAssets.push(item); break;
      case 'travel': travel.push(item); break;
      case 'program': programExpenses.push(item); break;
      case 'admin': adminCost.push(item); break;
    }
  }

  const fmt = (n: number) => n >= 10000000
    ? `₹${(n / 10000000).toFixed(2)} Cr`
    : n >= 100000
    ? `₹${(n / 100000).toFixed(2)} L`
    : `₹${Math.round(n).toLocaleString('en-IN')}`;

  const lines: string[] = ['=== BUDGET SUMMARY ==='];
  for (const c of categories) {
    lines.push(`${c.name}: ${fmt(c.grantTotal)} (${(c.pct * 100).toFixed(1)}%)`);
  }
  lines.push(`Total grant: ${fmt(grandTotal)}`);

  lines.push('\n=== PROGRAM STAFF ===');
  for (const s of programStaff) {
    lines.push(`${s.description}: ${fmt(s.total)} [${s.budgetFor}]${s.notes ? ` — ${s.notes.slice(0, 100)}` : ''}`);
  }

  lines.push('\n=== ADMIN STAFF ===');
  for (const s of adminStaff) {
    lines.push(`${s.description}: ${fmt(s.total)} [${s.budgetFor}]`);
  }

  lines.push('\n=== FIXED ASSETS ===');
  for (const s of fixedAssets) {
    lines.push(`${s.description}: ${fmt(s.total)}${s.notes ? ` — ${s.notes.slice(0, 80)}` : ''}`);
  }

  return {
    summary: { categories, grandTotal, years },
    programStaff, adminStaff, fixedAssets, travel, programExpenses, adminCost,
    raw: lines.join('\n'),
  };
}
