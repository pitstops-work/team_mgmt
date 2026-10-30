import * as XLSX from 'xlsx';

export type BudgetSummary = {
  categories: { name: string; yearlyTotals: number[]; grantTotal: number; pct: number }[];
  /** The a./b. split under "Salary, Honorarium, Staff benefits", when the sheet carries one. */
  salarySplit: { name: string; grantTotal: number }[];
  /**
   * Labelled numeric rows found on the summary sheet outside the six-category
   * table — vertical-wise summaries, indicative unit costs, cost-per-household.
   * These carry the shape of the grant and used to be dropped on the floor.
   */
  extraLines: string[];
  grandTotal: number;
  /** The sheet's own stated total, when present — used to cross-check grandTotal. */
  statedTotal: number | null;
  years: number;
};

export type BudgetLineItem = {
  sno: string;
  description: string;
  category: string;
  /** Sheet the line came from. With per-vertical workbooks this is the vertical. */
  sheet: string;
  unitType: string;
  units: number;
  unitCost: number;
  yearTotals: number[];
  total: number;
  notes: string;
  budgetFor: string;
};

export type BudgetAssumption = { label: string; value: string; note: string };

export type BudgetDiagnostics = {
  /** False when the workbook yielded no usable money. Callers must surface this. */
  ok: boolean;
  sheetsSeen: string[];
  summarySheet: string | null;
  lineItemSheets: string[];
  assumptionSheet: string | null;
  workingSheet: string | null;
  lineItemCount: number;
  warnings: string[];
};

export type BudgetData = {
  summary: BudgetSummary;
  programStaff: BudgetLineItem[];
  adminStaff: BudgetLineItem[];
  fixedAssets: BudgetLineItem[];
  travel: BudgetLineItem[];
  programExpenses: BudgetLineItem[];
  adminCost: BudgetLineItem[];
  assumptions: BudgetAssumption[];
  /** Unit-cost derivations ("₹40/child/day × 20 children × 360 days = ₹288,000"). */
  workings: string[];
  /** Per-sheet grand totals, for a vertical-wise table in the note. */
  sheetTotals: { sheet: string; total: number }[];
  diagnostics: BudgetDiagnostics;
  raw: string;
};

// The six APF budget categories, keyed by the Sl. No. they carry on the summary
// sheet. Used as the canonical label when the sheet's own wording drifts.
const CATEGORY_LABELS: Record<number, string> = {
  1: 'Salary / Honorarium / Staff benefits',
  2: 'Fixed Assets / CAPEX',
  3: 'Travel, Boarding & Lodging',
  4: 'Program expenses',
  5: 'Administration cost',
};

type Row = unknown[];

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // Excel sometimes hands back numerics as strings ("1,000", "₹2500").
  if (typeof v === 'string') {
    const cleaned = v.replace(/[₹,\s]/g, '');
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  }
  return null;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function rowsOf(wb: XLSX.WorkBook, sheetName: string): Row[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as Row[];
}

/** First row index whose cells satisfy every predicate. -1 when none does. */
function findHeaderRow(rows: Row[], ...predicates: RegExp[]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] || []).map(str);
    if (predicates.every(re => cells.some(c => re.test(c)))) return i;
  }
  return -1;
}

/** Index of the first header cell matching `re`, or -1. */
function col(header: Row, re: RegExp): number {
  for (let i = 0; i < header.length; i++) {
    if (re.test(str(header[i]))) return i;
  }
  return -1;
}

/** Indices of every header cell matching `re`. */
function cols(header: Row, re: RegExp): number[] {
  const out: number[] = [];
  for (let i = 0; i < header.length; i++) {
    if (re.test(str(header[i]))) out.push(i);
  }
  return out;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/**
 * A number with no currency symbol, for cells that may be counts, ratios or
 * money. Large values also get the Cr/L reading, since 21768000 is unreadable.
 */
function plain(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  const base = rounded.toLocaleString('en-IN');
  const abs = Math.abs(rounded);
  if (abs >= 10000000) return `${base} (${(rounded / 10000000).toFixed(2)} Cr)`;
  if (abs >= 100000) return `${base} (${(rounded / 100000).toFixed(2)} L)`;
  return base;
}

// ── Summary sheet ───────────────────────────────────────────────────────────
// Driven off the header row rather than fixed column offsets, because the same
// table ships with and without a leading blank column, and Sl. No. arrives as
// either a number or a string depending on how the workbook was authored.

function parseSummary(wb: XLSX.WorkBook, warnings: string[]): {
  summary: BudgetSummary;
  sheetName: string | null;
} {
  const empty: BudgetSummary = {
    categories: [], salarySplit: [], extraLines: [],
    grandTotal: 0, statedTotal: null, years: 0,
  };

  const candidates = wb.SheetNames.filter(n => /summary/i.test(n));
  for (const name of candidates.length ? candidates : wb.SheetNames) {
    const rows = rowsOf(wb, name);
    const headerIdx = findHeaderRow(rows, /budget category|^category$/i);
    if (headerIdx === -1) continue;

    const header = rows[headerIdx];
    const slCol = col(header, /^sl\.?\s*no/i);
    const catCol = col(header, /budget category|^category$/i);
    const yearCols = cols(header, /^year\s*(i|ii|iii|iv|v|\d)/i);
    const grantCol = col(header, /requested grant|grant total/i);
    const totalCol = grantCol !== -1 ? grantCol : col(header, /^total/i);
    const pctCol = col(header, /^%|percent/i);
    if (catCol === -1 || totalCol === -1) continue;

    const categories: BudgetSummary['categories'] = [];
    const salarySplit: BudgetSummary['salarySplit'] = [];
    let grandTotal = 0;
    let statedTotal: number | null = null;
    let years = 0;
    let tableEnd = headerIdx;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const label = str(row[catCol]);
      const sl = slCol === -1 ? '' : str(row[slCol]);
      const total = num(row[totalCol]);

      if (!label) continue;
      if (/^total$/i.test(label)) {
        statedTotal = total;
        tableEnd = i;
        break;
      }
      if (total === null) continue;

      const yearlyTotals = yearCols.map(c => num(row[c]) ?? 0).filter(v => v > 0);
      if (/^\d+$/.test(sl)) {
        const n = Number(sl);
        categories.push({
          name: CATEGORY_LABELS[n] || label,
          yearlyTotals,
          grantTotal: total,
          pct: num(row[pctCol]) ?? 0,
        });
        grandTotal += total;
        years = Math.max(years, yearlyTotals.length);
      } else if (/^[a-z]$/i.test(sl)) {
        // a./b. sub-rows under the salary category. Not added to grandTotal —
        // the parent row already counts them — but the note needs the split.
        salarySplit.push({ name: label, grantTotal: total });
      }
      tableEnd = i;
    }

    if (categories.length === 0) continue;

    // Everything below the category table that still carries a label and a
    // number: vertical-wise summary, indicative unit costs, checks.
    const extraLines: string[] = [];
    const seen = new Set<string>();
    for (let i = tableEnd + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const texts = row.map(str).filter(c => c.length >= 2 && c.length <= 120 && num(c) === null);
      const numbers = row.map(num).filter((v): v is number => v !== null);
      if (texts.length === 0) continue;
      const label = texts[0];
      if (numbers.length === 0) {
        // Either a sub-heading, or a label with a text value (e.g. a check row
        // reading "OK"). Keep both so the numbers below stay attributable.
        const line = texts.length > 1 ? `  ${label}: ${texts.slice(1).join(' | ')}` : `${label}:`;
        if (!seen.has(line)) { extraLines.push(line); seen.add(line); }
        continue;
      }
      // Plain numbers here, not fmt() — this tail block mixes money with
      // counts and ratios, and a ₹ on a household count is a lie.
      const line = `  ${label}: ${numbers.map(plain).join(' | ')}`;
      if (!seen.has(line)) { extraLines.push(line); seen.add(line); }
    }

    if (statedTotal !== null && Math.abs(statedTotal - grandTotal) > 1) {
      warnings.push(
        `Summary sheet "${name}": category rows sum to ${fmt(grandTotal)} but the sheet states ${fmt(statedTotal)}.`,
      );
    }

    return {
      summary: { categories, salarySplit, extraLines, grandTotal, statedTotal, years },
      sheetName: name,
    };
  }

  warnings.push('No budget summary table found — looked for a header row containing "Budget Category".');
  return { summary: empty, sheetName: null };
}

// ── Line-item sheets ────────────────────────────────────────────────────────
// A sheet is a line-item sheet when it has a header row carrying both a
// Description column and a unit-cost or total column. That is layout-driven, so
// it finds the legacy single "03.Budget" sheet and per-vertical "Budget - X"
// sheets alike, without the parser knowing either name.

const SECTION_PATTERNS: Array<{ re: RegExp; section: string }> = [
  // The a./b. sub-headings come first: they appear both on their own ("b. Admin
  // staff") and appended to the parent heading ("Salary, Honorarium, Staff
  // benefits — a. Program staff"), and only they distinguish the two.
  { re: /\badmin(istration)?\s+staff\b/i, section: 'salary-admin' },
  { re: /\bprogram(me)?\s+staff\b/i, section: 'salary-program' },
  { re: /salary|honorarium|staff benefit/i, section: 'salary-program' },
  { re: /fixed asset|capex/i, section: 'fixed' },
  { re: /travel|boarding|lodging/i, section: 'travel' },
  { re: /program(me)?\s*expense/i, section: 'program' },
  { re: /admin(istration)?\s*(cost|expense)/i, section: 'admin' },
];

function classifySection(desc: string): string | null {
  for (const { re, section } of SECTION_PATTERNS) {
    if (!re.test(desc)) continue;
    if (section === 'salary-program') {
      // "a. Program staff" vs "b. Admin staff" ride on the same heading.
      return /\badmin/i.test(desc) ? 'salary-admin' : 'salary-program';
    }
    return section;
  }
  return null;
}

function parseLineItems(
  wb: XLSX.WorkBook,
  skipSheets: Set<string>,
  warnings: string[],
): { items: BudgetLineItem[]; sheets: string[]; sheetTotals: { sheet: string; total: number }[] } {
  const items: BudgetLineItem[] = [];
  const sheets: string[] = [];
  const sheetTotals: { sheet: string; total: number }[] = [];

  for (const name of wb.SheetNames) {
    if (skipSheets.has(name)) continue;
    const rows = rowsOf(wb, name);
    const headerIdx = findHeaderRow(rows, /^description/i, /unit cost|^total/i);
    if (headerIdx === -1) continue;

    const header = rows[headerIdx];
    const snoCol = col(header, /^s\.?\s*no|^sl\.?\s*no/i);
    const descCol = col(header, /^description/i);
    const unitTypeCol = col(header, /unit type/i);
    const unitsCol = col(header, /no\.? of units/i);
    const unitCostCol = col(header, /unit cost/i);
    const yearTotalCols = cols(header, /total.*year\s*\d/i);
    const totalCol = cols(header, /^total\b/i).find(c => !yearTotalCols.includes(c)) ?? -1;
    const notesCol = col(header, /budget note|^note|basis|remark/i);
    const budgetForCol = col(header, /budget for/i);

    sheets.push(name);
    let currentSection = '';
    let sheetTotal = 0;
    let found = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const desc = str(row[descCol]);
      if (!desc) continue;

      const sno = snoCol === -1 ? '' : str(row[snoCol]);
      const total = totalCol === -1 ? null : num(row[totalCol]);
      const yearTotals = yearTotalCols.map(c => num(row[c]) ?? 0);
      const unitCost = unitCostCol === -1 ? null : num(row[unitCostCol]);
      const hasMoney = total !== null || yearTotals.some(v => v !== 0) || unitCost !== null;

      // The sheet's own grand-total row.
      if (/^total$/i.test(sno)) {
        if (total !== null) sheetTotal = total;
        continue;
      }
      if (/^sub-?total$/i.test(desc) || /^total$/i.test(desc) || /^grand total$/i.test(desc)) continue;

      // A section heading carries a category name and no money of its own.
      if (!hasMoney) {
        const section = classifySection(desc);
        if (section) currentSection = section;
        continue;
      }

      if (total === 0 && (unitCost === null || unitCost === 0)) continue;

      // A row that looks like money but sits under no heading yet: classify it
      // from its own text rather than dropping it.
      const section = currentSection || classifySection(desc) || 'program';

      items.push({
        sno,
        description: desc,
        category: section,
        sheet: name,
        unitType: unitTypeCol === -1 ? '' : str(row[unitTypeCol]),
        units: unitsCol === -1 ? 0 : (num(row[unitsCol]) ?? 0),
        unitCost: unitCost ?? 0,
        yearTotals: yearTotals.filter(v => v > 0),
        total: total ?? 0,
        notes: notesCol === -1 ? '' : str(row[notesCol]),
        budgetFor: budgetForCol === -1 ? '' : str(row[budgetForCol]),
      });
      found += 1;
    }

    if (found === 0) {
      warnings.push(`Sheet "${name}" looked like a budget sheet but yielded no line items.`);
    }
    if (sheetTotal === 0) {
      sheetTotal = items.filter(it => it.sheet === name).reduce((s, it) => s + it.total, 0);
    }
    sheetTotals.push({ sheet: name, total: sheetTotal });
  }

  if (sheets.length === 0) {
    warnings.push('No budget line-item sheet found — looked for a header row with "Description" and "Unit Cost"/"Total".');
  }
  return { items, sheets, sheetTotals };
}

// ── Assumptions sheet ───────────────────────────────────────────────────────
// Scale inputs (grant months, number of centres, households covered) define
// what the grant actually buys. Previously never read at all.

function parseAssumptions(wb: XLSX.WorkBook): { assumptions: BudgetAssumption[]; sheetName: string | null } {
  for (const name of wb.SheetNames) {
    if (!/assumption|input/i.test(name)) continue;
    const rows = rowsOf(wb, name);
    // Both predicates, or the sheet's own title row ("Assumptions and scale
    // inputs — APSA") wins the match and every label comes out as "Sl.".
    const headerIdx = findHeaderRow(rows, /^parameter|^assumption|^input/i, /^value/i);
    const header = headerIdx === -1 ? [] : rows[headerIdx];
    const labelCol = headerIdx === -1 ? 1 : col(header, /^parameter|^assumption|^input/i);
    const valueCol = headerIdx === -1 ? 2 : col(header, /^value/i);
    const noteCol = headerIdx === -1 ? 3 : col(header, /^note|basis|remark/i);

    const assumptions: BudgetAssumption[] = [];
    for (let i = (headerIdx === -1 ? 0 : headerIdx + 1); i < rows.length; i++) {
      const row = rows[i] || [];
      const label = str(row[labelCol]);
      if (!label) continue;
      const rawValue = valueCol === -1 ? null : row[valueCol];
      const value = num(rawValue);
      if (value === null && !str(rawValue)) {
        // A label with no value is a group heading inside the sheet.
        assumptions.push({ label, value: '', note: '' });
        continue;
      }
      assumptions.push({
        label,
        value: value !== null ? String(value) : str(rawValue),
        note: noteCol === -1 ? '' : str(row[noteCol]),
      });
    }
    if (assumptions.length > 0) return { assumptions, sheetName: name };
  }
  return { assumptions: [], sheetName: null };
}

// ── Working sheet ───────────────────────────────────────────────────────────
// How each unit cost was derived. This is what lets a reviewer check whether
// "lunch at the learning centres" assumes 20 children or 100.

function parseWorkings(wb: XLSX.WorkBook): { workings: string[]; sheetName: string | null } {
  for (const name of wb.SheetNames) {
    if (!/working|derivation/i.test(name)) continue;
    const rows = rowsOf(wb, name);
    const headerIdx = findHeaderRow(rows, /unit cost/i);
    if (headerIdx === -1) continue;
    const header = rows[headerIdx];
    const descCol = cols(header, /expense|description|item/i)[0] ?? 1;
    const unitCostCol = col(header, /unit cost/i);
    const basisCol = col(header, /basis|^note|remark/i);
    const componentCols = cols(header, /^component|^value\s*\d/i);
    const monthsCol = col(header, /12 months/i);

    const workings: string[] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const desc = str(row[descCol]);
      if (!desc) continue;
      const unitCost = num(row[unitCostCol]);
      if (unitCost === null) {
        workings.push(`${desc}:`); // group heading
        continue;
      }
      const parts: string[] = [];
      for (let c = 0; c < componentCols.length; c += 2) {
        const compLabel = str(row[componentCols[c]]);
        const compValue = componentCols[c + 1] !== undefined ? row[componentCols[c + 1]] : null;
        const v = num(compValue);
        if (!compLabel && v === null) continue;
        parts.push(v !== null ? `${v} ${compLabel}`.trim() : compLabel);
      }
      if (monthsCol !== -1 && /^yes$/i.test(str(row[monthsCol]))) parts.push('× 12 months');
      const basis = basisCol === -1 ? '' : str(row[basisCol]);
      workings.push(
        `  ${desc} = ${parts.join(' × ') || 'n/a'} → ${fmt(unitCost)}${basis ? ` [${basis}]` : ''}`,
      );
    }
    if (workings.length > 0) return { workings, sheetName: name };
  }
  return { workings: [], sheetName: null };
}

// ── Public entry point ──────────────────────────────────────────────────────

export function parseBudgetExcel(buffer: Buffer): BudgetData {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const warnings: string[] = [];

  const { summary, sheetName: summarySheet } = parseSummary(wb, warnings);
  const skip = new Set<string>(summarySheet ? [summarySheet] : []);
  const { items, sheets: lineItemSheets, sheetTotals } = parseLineItems(wb, skip, warnings);
  const { assumptions, sheetName: assumptionSheet } = parseAssumptions(wb);
  const { workings, sheetName: workingSheet } = parseWorkings(wb);

  const byCategory = (section: string) => items.filter(it => it.category === section);
  const programStaff = byCategory('salary-program');
  const adminStaff = byCategory('salary-admin');
  const fixedAssets = byCategory('fixed');
  const travel = byCategory('travel');
  const programExpenses = byCategory('program');
  const adminCost = byCategory('admin');

  const lineItemTotal = items.reduce((s, it) => s + it.total, 0);
  if (summary.grandTotal > 0 && lineItemTotal > 0) {
    const drift = Math.abs(summary.grandTotal - lineItemTotal);
    if (drift / summary.grandTotal > 0.01) {
      warnings.push(
        `Line items sum to ${fmt(lineItemTotal)} but the summary says ${fmt(summary.grandTotal)} — ${fmt(drift)} unaccounted for.`,
      );
    }
  }

  const diagnostics: BudgetDiagnostics = {
    ok: summary.grandTotal > 0 || lineItemTotal > 0,
    sheetsSeen: wb.SheetNames.slice(),
    summarySheet,
    lineItemSheets,
    assumptionSheet,
    workingSheet,
    lineItemCount: items.length,
    warnings,
  };

  const multiSheet = lineItemSheets.length > 1;
  const renderItem = (it: BudgetLineItem): string => {
    const prefix = multiSheet ? `[${it.sheet}] ` : '';
    // "Per creche" already carries its own preposition; don't emit "per per creche".
    const unitNoun = it.unitType ? it.unitType.toLowerCase().replace(/^per\s+/, '') : '';
    const unit = it.unitCost > 0
      ? ` (${it.units > 0 ? `${plain(it.units)} × ` : ''}${fmt(it.unitCost)}${unitNoun ? ` per ${unitNoun}` : ''})`
      : '';
    const perYear = it.yearTotals.length > 1 ? ` [by year: ${it.yearTotals.map(fmt).join(' / ')}]` : '';
    const tail = [it.budgetFor, it.notes].filter(Boolean).join(' — ');
    return `${prefix}${it.description}: ${fmt(it.total)}${unit}${perYear}${tail ? ` — ${tail}` : ''}`;
  };

  const lines: string[] = [];

  if (!diagnostics.ok) {
    lines.push('=== BUDGET FILE COULD NOT BE READ ===');
    lines.push('The parser found no budget figures in this workbook. Its sheets are:');
    lines.push(`  ${diagnostics.sheetsSeen.join(', ') || '(none)'}`);
    for (const w of warnings) lines.push(`  - ${w}`);
    lines.push('');
    lines.push('DO NOT invent, infer, estimate or round any budget figure. State plainly');
    lines.push('in the note that the budget file could not be read, and leave every');
    lines.push('financial field as [to be filled].');
    return {
      summary, programStaff, adminStaff, fixedAssets, travel, programExpenses, adminCost,
      assumptions, workings, sheetTotals, diagnostics, raw: lines.join('\n'),
    };
  }

  if (warnings.length > 0) {
    lines.push('=== BUDGET PARSE WARNINGS (treat the affected figures as unconfirmed) ===');
    for (const w of warnings) lines.push(`  - ${w}`);
    lines.push('');
  }

  lines.push('=== BUDGET SUMMARY ===');
  for (const c of summary.categories) {
    const byYear = c.yearlyTotals.length > 1 ? ` [by year: ${c.yearlyTotals.map(fmt).join(' / ')}]` : '';
    lines.push(`${c.name}: ${fmt(c.grantTotal)} (${(c.pct * 100).toFixed(1)}%)${byYear}`);
  }
  for (const s of summary.salarySplit) {
    lines.push(`  of which ${s.name}: ${fmt(s.grantTotal)}`);
  }
  lines.push(`Total grant: ${fmt(summary.grandTotal)}`);
  if (summary.years > 0) lines.push(`Years in budget: ${summary.years}`);
  if (summary.extraLines.length > 0) {
    lines.push('');
    lines.push('--- Other summary tables on this sheet ---');
    lines.push(...summary.extraLines);
  }

  if (assumptions.length > 0) {
    lines.push('');
    lines.push('=== SCALE ASSUMPTIONS (what the grant buys) ===');
    for (const a of assumptions) {
      lines.push(a.value ? `  ${a.label}: ${a.value}${a.note ? ` — ${a.note}` : ''}` : `${a.label}:`);
    }
  }

  if (sheetTotals.length > 1) {
    lines.push('');
    lines.push('=== TOTALS BY BUDGET SHEET / VERTICAL ===');
    for (const s of sheetTotals) lines.push(`  ${s.sheet}: ${fmt(s.total)}`);
  }

  const sections: Array<[string, BudgetLineItem[]]> = [
    ['PROGRAM STAFF', programStaff],
    ['ADMIN STAFF', adminStaff],
    ['FIXED ASSETS / CAPEX', fixedAssets],
    ['TRAVEL, BOARDING & LODGING', travel],
    ['PROGRAM EXPENSES', programExpenses],
    ['ADMINISTRATION COST', adminCost],
  ];
  for (const [label, group] of sections) {
    lines.push('');
    lines.push(`=== ${label} ===`);
    if (group.length === 0) {
      lines.push('  (no line items)');
      continue;
    }
    for (const it of group) lines.push(renderItem(it));
    lines.push(`  Sub-total: ${fmt(group.reduce((s, it) => s + it.total, 0))}`);
  }

  if (workings.length > 0) {
    lines.push('');
    lines.push('=== UNIT COST DERIVATIONS ===');
    lines.push(...workings);
  }

  return {
    summary, programStaff, adminStaff, fixedAssets, travel, programExpenses, adminCost,
    assumptions, workings, sheetTotals, diagnostics, raw: lines.join('\n'),
  };
}
