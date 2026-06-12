// Cross-DB bridge: pulls a Creche budget from the main app's Prisma store
// (DATABASE_URL) and returns a comparison snapshot in the format the docs use
// — per-creche cost, three sections (one-time / annual recurring / supervisory
// & support), with deviation against the live CostRegistry standard.
//
// Called from review-portal pages (same Next.js runtime, NextAuth session
// available). Snapshot is persisted into grant_note_metadata.budget_comparison
// at note-create time so the note doesn't drift if the budget is later edited.

import prisma from "@/lib/prisma";
import {
  generateBudgetLines,
  activeYearBands,
} from "@/lib/budget-generator";
import type { BudgetSection } from "@/app/generated/prisma/client";

export type DeviationRow = {
  templateKey: string;
  description: string;
  perCrecheProposed: number;
  perCrecheStandard: number;
  perCrecheDelta: number;
  pct: number | null;
};

export type DeviationGroup = {
  label: string;
  rows: DeviationRow[];
  subtotalProposed: number;
  subtotalStandard: number;
  subtotalDelta: number;
  subtotalPct: number | null;
};

export type BudgetComparisonSnapshot = {
  budgetId: string;
  budgetName: string;
  city: string;
  nCreches: number;
  groups: DeviationGroup[];
  // 5-col HTML table in the docs' format, ready to drop into a section.
  tableHtml: string;
  generatedAt: string;
};

const SECTION_TO_GROUP: Record<BudgetSection, string> = {
  capex:        "1. One-time support for setting up a creche",
  programme:    "2. Annual Recurring operating cost",
  salary:       "3. Supervisory and support cost",
  travel:       "3. Supervisory and support cost",
  admin_salary: "4. Management Cost",
  admin_other:  "4. Management Cost",
  additional:   "5. Other Cost",
};

const GROUP_ORDER = [
  "1. One-time support for setting up a creche",
  "2. Annual Recurring operating cost",
  "3. Supervisory and support cost",
  "4. Management Cost",
  "5. Other Cost",
];

function fmtRs(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "—";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function fmtPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return "—";
  if (Math.abs(p) < 0.5) return "0%";
  return (p > 0 ? "+" : "") + Math.round(p) + "%";
}

export async function loadCrecheBudgetSnapshot(
  budgetId: string,
  viewerUserId: string,
): Promise<BudgetComparisonSnapshot> {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: {
      id: true, name: true, city: true, partnerId: true, domains: true,
      inputs: true, costSnapshot: true, costOverrides: true,
      lines: {
        select: {
          templateKey: true, section: true, description: true,
          y1Total: true,
        },
      },
    },
  });
  if (!budget) throw new Error("Budget not found");
  if (budget.partnerId !== viewerUserId) {
    // Main app's RBAC layer will gate non-owner reads upstream; bridge stays strict.
    throw new Error("Not authorised to read this budget");
  }
  if (!budget.domains.includes("Creche")) {
    throw new Error("Budget does not include the Creche domain");
  }

  const raw = budget.inputs;
  const programmeInputs: Record<string, number> = {};
  if (raw) {
    programmeInputs.nSettlements              = raw.nSettlements;
    programmeInputs.nClusters                 = raw.nClusters;
    programmeInputs.nCLCs                     = raw.nCLCs;
    programmeInputs.nCreches                  = raw.nCreches;
    programmeInputs.crecheRentPerMonth        = raw.crecheRentPerMonth;
    Object.assign(programmeInputs, (raw.extraInputs ?? {}) as Record<string, number>);
  }
  const nCreches = Math.max(1, Math.round(programmeInputs.nCreches ?? 0));

  // Generate "standard" lines from the snapshot+templates using the same
  // inputs the budget was created with. Snapshot wins over the live registry
  // because that's what the partner saw at create time.
  const [registryRows, templates] = await Promise.all([
    prisma.costRegistry.findMany({ where: { city: budget.city } }),
    prisma.lineTemplate.findMany({ where: { city: budget.city }, orderBy: { position: "asc" } }),
  ]);
  const snapshot = (budget.costSnapshot ?? {}) as Record<string, number>;
  const liveRegistry = Object.fromEntries(registryRows.map(r => [r.itemKey, r.unitCost]));
  const standardRegistry = { ...liveRegistry, ...snapshot };
  const horizonMonths = 36;
  const stdLines = generateBudgetLines(
    budget.domains,
    programmeInputs,
    { horizonMonths, applyInflation: true },
    standardRegistry,
    templates.filter(t => t.domain === null || budget.domains.includes(t.domain!)),
  );

  // Yours: saved BudgetLine rows (authoritative — captures salary stub fill-ins
  // and manual edits). Drop non-creche domains from both sides.
  const isCrecheTemplate = (k: string | null) => !!k && k.startsWith("creche.");

  const yoursByKey = new Map<string, { total: number; section: BudgetSection; description: string }>();
  for (const l of budget.lines) {
    if (!isCrecheTemplate(l.templateKey)) continue;
    yoursByKey.set(l.templateKey!, {
      total: l.y1Total,
      section: l.section,
      description: l.description,
    });
  }
  const stdByKey = new Map<string, { total: number; section: BudgetSection; description: string }>();
  for (const l of stdLines) {
    if (!isCrecheTemplate(l.templateKey)) continue;
    stdByKey.set(l.templateKey, {
      total: l.y1Total,
      section: l.section as BudgetSection,
      description: l.description,
    });
  }

  // Union of all templateKeys — rows present in only one side become a
  // single-sided deviation (std=0 or yours=0), which is what the docs show
  // when a partner adds a Safety Manager line absent from the standard.
  const allKeys = new Set<string>([...yoursByKey.keys(), ...stdByKey.keys()]);

  // Bucket into the doc-style groups.
  const groupsByLabel = new Map<string, DeviationRow[]>();
  for (const key of allKeys) {
    const y = yoursByKey.get(key);
    const s = stdByKey.get(key);
    const description = y?.description ?? s?.description ?? key;
    const section = (y?.section ?? s?.section) as BudgetSection;
    const label = SECTION_TO_GROUP[section] ?? "5. Other Cost";
    const yoursTotal = y?.total ?? 0;
    const stdTotal = s?.total ?? 0;
    const perCrecheProposed = Math.round(yoursTotal / nCreches);
    const perCrecheStandard = Math.round(stdTotal / nCreches);
    const perCrecheDelta = perCrecheProposed - perCrecheStandard;
    const pct = perCrecheStandard > 0
      ? (perCrecheDelta / perCrecheStandard) * 100
      : (perCrecheProposed > 0 ? null : 0);
    const row: DeviationRow = {
      templateKey: key,
      description,
      perCrecheProposed,
      perCrecheStandard,
      perCrecheDelta,
      pct,
    };
    const arr = groupsByLabel.get(label) ?? [];
    arr.push(row);
    groupsByLabel.set(label, arr);
  }

  const groups: DeviationGroup[] = GROUP_ORDER
    .filter(label => groupsByLabel.has(label))
    .map(label => {
      const rows = groupsByLabel.get(label)!
        .sort((a, b) => a.description.localeCompare(b.description));
      const subtotalProposed = rows.reduce((s, r) => s + r.perCrecheProposed, 0);
      const subtotalStandard = rows.reduce((s, r) => s + r.perCrecheStandard, 0);
      const subtotalDelta = subtotalProposed - subtotalStandard;
      const subtotalPct = subtotalStandard > 0
        ? (subtotalDelta / subtotalStandard) * 100
        : (subtotalProposed > 0 ? null : 0);
      return { label, rows, subtotalProposed, subtotalStandard, subtotalDelta, subtotalPct };
    });

  const tableHtml = renderDeviationTableHtml(groups, nCreches);

  return {
    budgetId: budget.id,
    budgetName: budget.name,
    city: budget.city,
    nCreches,
    groups,
    tableHtml,
    generatedAt: new Date().toISOString(),
  };
}

function renderDeviationTableHtml(groups: DeviationGroup[], nCreches: number): string {
  const parts: string[] = [];
  parts.push(`<p><em>Deviation from the standard budget — per creche, ${nCreches} creche${nCreches === 1 ? "" : "s"}.</em></p>`);
  parts.push(`<table class="data-table">`);
  parts.push(
    `<thead><tr>` +
    `<th>Sl. No</th><th>Budget Item</th>` +
    `<th style="text-align:right">Proposed (₹)</th>` +
    `<th style="text-align:right">Standard (₹)</th>` +
    `<th style="text-align:right">Deviation (₹)</th>` +
    `<th style="text-align:right">%</th>` +
    `</tr></thead>`,
  );
  parts.push(`<tbody>`);
  for (const g of groups) {
    parts.push(
      `<tr><td colspan="6"><strong>${escapeHtml(g.label)}</strong></td></tr>`,
    );
    g.rows.forEach((r, i) => {
      const sl = String.fromCharCode(65 + i); // A, B, C…
      parts.push(
        `<tr>` +
        `<td>${sl}</td>` +
        `<td>${escapeHtml(r.description)}</td>` +
        `<td style="text-align:right">${fmtRs(r.perCrecheProposed)}</td>` +
        `<td style="text-align:right">${fmtRs(r.perCrecheStandard)}</td>` +
        `<td style="text-align:right">${fmtRs(r.perCrecheDelta)}</td>` +
        `<td style="text-align:right">${fmtPct(r.pct)}</td>` +
        `</tr>`,
      );
    });
    parts.push(
      `<tr>` +
      `<td></td>` +
      `<td><strong>Sub-total</strong></td>` +
      `<td style="text-align:right"><strong>${fmtRs(g.subtotalProposed)}</strong></td>` +
      `<td style="text-align:right"><strong>${fmtRs(g.subtotalStandard)}</strong></td>` +
      `<td style="text-align:right"><strong>${fmtRs(g.subtotalDelta)}</strong></td>` +
      `<td style="text-align:right"><strong>${fmtPct(g.subtotalPct)}</strong></td>` +
      `</tr>`,
    );
  }
  parts.push(`</tbody></table>`);
  return parts.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Light list for the budget_picker dropdown — id + label only.
export async function listUserCrecheBudgets(viewerUserId: string): Promise<
  Array<{ id: string; name: string; city: string }>
> {
  const rows = await prisma.budget.findMany({
    where: { partnerId: viewerUserId, domains: { has: "Creche" } },
    select: { id: true, name: true, city: true },
    orderBy: { createdAt: "desc" },
  });
  return rows;
}

// activeYearBands is imported only to keep the unused-import linter happy when
// generator opts shift; not part of the runtime surface.
void activeYearBands;
