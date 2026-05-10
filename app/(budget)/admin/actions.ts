"use server";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDefaultsForCity } from "@/lib/budget-costs";
import { getTemplatesForCity } from "@/lib/line-template-seeds";
import type { BudgetSection, InflationType } from "@/app/generated/prisma/client";
import { revalidatePath } from "next/cache";

export async function seedCostRegistry(city = "Bangalore") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const defaults = getDefaultsForCity(city);
  await prisma.$transaction(
    defaults.map(c =>
      prisma.costRegistry.upsert({
        where: { city_itemKey: { city, itemKey: c.itemKey } },
        create: {
          city,
          domain: c.domain ?? undefined,
          itemKey: c.itemKey,
          unitCost: c.unitCost,
          unit: c.unit,
          effectiveYear: 2025,
          notes: c.notes,
        },
        update: {},  // Don't overwrite edits
      })
    )
  );

  revalidatePath("/admin");
}

export async function addCostItem(
  city: string,
  data: { domain?: string | null; itemKey: string; unit: string; unitCost: number; notes?: string; displayGroup?: string | null }
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await prisma.costRegistry.create({
    data: {
      city,
      domain: data.domain ?? null,
      itemKey: data.itemKey,
      unit: data.unit,
      unitCost: data.unitCost,
      effectiveYear: 2025,
      notes: data.notes ?? null,
      displayGroup: data.displayGroup ?? null,
    },
  });
  revalidatePath("/admin");
}

export async function updateCostRegistry(id: string, unitCost: number, notes?: string, displayGroup?: string | null) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  await prisma.costRegistry.update({
    where: { id },
    data: { unitCost, notes, ...(displayGroup !== undefined ? { displayGroup } : {}) },
  });
  revalidatePath("/admin");
}

// Standard inp.* display groups — used for seeding and derived defaults
const STANDARD_PROG_INPUTS = [
  { itemKey: "inp.nSettlements",              unit: "count",    unitCost: 10,    notes: "No. of settlements",                    displayGroup: "geography"  },
  { itemKey: "inp.nClusters",                 unit: "count",    unitCost: 3,     notes: "No. of clusters",                       displayGroup: "geography"  },
  { itemKey: "inp.cosPerCluster",             unit: "count",    unitCost: 2,     notes: "COs per cluster",                       displayGroup: "geography"  },
  { itemKey: "inp.cosTotal",                  unit: "count",    unitCost: 0,     notes: "Total COs",                             displayGroup: "geography"  },
  { itemKey: "inp.nCLCs",                     unit: "count",    unitCost: 5,     notes: "No. of CLCs",                           displayGroup: "facilities" },
  { itemKey: "inp.clcRentPerMonth",           unit: "₹/month",  unitCost: 15000, notes: "CLC rent / mo",                         displayGroup: "facilities" },
  { itemKey: "inp.nYRCs",                     unit: "count",    unitCost: 2,     notes: "No. of YRCs",                           displayGroup: "facilities" },
  { itemKey: "inp.yrcRentPerMonth",           unit: "₹/month",  unitCost: 10000, notes: "YRC rent / mo",                         displayGroup: "facilities" },
  { itemKey: "inp.nElderlyCentres",           unit: "count",    unitCost: 2,     notes: "No. of elderly centres",                displayGroup: "facilities" },
  { itemKey: "inp.elderlyCentreRentPerMonth", unit: "₹/month",  unitCost: 8000,  notes: "Elderly centre rent / mo",              displayGroup: "facilities" },
  { itemKey: "inp.nCreches",                  unit: "count",    unitCost: 3,     notes: "No. of creches",                        displayGroup: "facilities" },
  { itemKey: "inp.crecheRentPerMonth",        unit: "₹/month",  unitCost: 12000, notes: "Creche rent / mo",                      displayGroup: "facilities" },
  { itemKey: "inp.rcRentPerMonth",            unit: "₹/month",  unitCost: 5000,  notes: "RC rent / mo",                          displayGroup: "facilities" },
  { itemKey: "inp.nElderly",                  unit: "count",    unitCost: 50,    notes: "Elderly enrolled",                      displayGroup: "coverage"   },
];

export async function seedProgrammeInputs(city: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  await prisma.$transaction(
    STANDARD_PROG_INPUTS.map(d =>
      prisma.costRegistry.upsert({
        where: { city_itemKey: { city, itemKey: d.itemKey } },
        create: { city, domain: null, effectiveYear: 2025, ...d },
        update: { displayGroup: d.displayGroup, notes: d.notes },
      })
    )
  );
  revalidatePath("/admin");
}

// Back-fills displayGroup AND fixes notes (removes "Typical" etc.) on existing standard items
export async function backfillDisplayGroups(city: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  await prisma.$transaction(
    STANDARD_PROG_INPUTS.map(d =>
      prisma.costRegistry.updateMany({
        where: { city, itemKey: d.itemKey },
        data: { displayGroup: d.displayGroup, notes: d.notes },
      })
    )
  );
  revalidatePath("/admin");
}

export async function deleteCostItem(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await prisma.costRegistry.delete({ where: { id } });
  revalidatePath("/admin");
}

export async function resetCostRegistry(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const entry = await prisma.costRegistry.findUnique({ where: { id } });
  if (!entry) return;

  const defaults = getDefaultsForCity(entry.city);
  const def = defaults.find(c => c.itemKey === entry.itemKey);
  if (!def) return;

  await prisma.costRegistry.update({
    where: { id },
    data: { unitCost: def.unitCost, notes: def.notes },
  });
  revalidatePath("/admin");
}

// ─── Line template actions ────────────────────────────────────────────────────

export type LineTemplateFields = {
  domain?: string | null;
  section: BudgetSection;
  description: string;
  costCategory: InflationType;
  unitType: string;
  notes?: string | null;
  salaryHint?: string | null;
  isAutoGenerated?: boolean;
  inputVar: string;
  inputMonthly?: boolean;
  supervisorRatioKey?: string | null;
  inputThreshold?: number | null;
  isSalaryStub?: boolean;
  userInputCost?: string | null;
  costKey?: string | null;
  costKey2?: string | null;
  costKey3?: string | null;
  costMonthly?: boolean;
  workerRatioKey?: string | null;
  bufferKey?: string | null;
  costPctOf?: string | null;
  costPct?: number | null;
  y1UnitsZero?: boolean;
};

export async function toggleLineTemplate(id: string, isActive: boolean) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await prisma.lineTemplate.update({ where: { id }, data: { isActive } });
  revalidatePath("/admin");
}

export async function addLineTemplate(city: string, fields: LineTemplateFields) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const maxPos = await prisma.lineTemplate.aggregate({
    where: { city },
    _max: { position: true },
  });
  const position = (maxPos._max.position ?? 0) + 1;
  const templateKey = `custom.${Date.now()}`;

  await prisma.lineTemplate.create({
    data: { city, templateKey, position, isActive: true, ...fields },
  });
  revalidatePath("/admin");
}

export async function updateLineTemplate(id: string, fields: Partial<LineTemplateFields>) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await prisma.lineTemplate.update({ where: { id }, data: fields });
  revalidatePath("/admin");
}

export async function deleteLineTemplate(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await prisma.lineTemplate.delete({ where: { id } });
  revalidatePath("/admin");
}

export async function reorderLineTemplates(city: string, orderedIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await prisma.$transaction(
    orderedIds.map((id, position) => prisma.lineTemplate.update({ where: { id }, data: { position } }))
  );
  revalidatePath("/admin");
}

// ─── Domain config actions ────────────────────────────────────────────────────

export type DomainConfigFields = {
  label: string;
  description?: string | null;
  beneficiaryLabel?: string | null;
  beneficiaryVar?: string | null;
  beneficiaryMult?: number;
};

async function ensureBeneficiaryVar(city: string, varName: string) {
  const itemKey = `inp.${varName}`;
  await prisma.costRegistry.upsert({
    where: { city_itemKey: { city, itemKey } },
    create: { city, itemKey, unit: "count", unitCost: 0, effectiveYear: 2025, domain: null },
    update: {},
  });
}

export async function addDomain(city: string, key: string, fields: DomainConfigFields) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const maxPos = await prisma.budgetDomainConfig.aggregate({
    where: { city },
    _max: { position: true },
  });
  await prisma.budgetDomainConfig.create({
    data: { city, key, position: (maxPos._max.position ?? -1) + 1, ...fields },
  });
  if (fields.beneficiaryVar) await ensureBeneficiaryVar(city, fields.beneficiaryVar);
  revalidatePath("/admin");
}

export async function updateDomain(id: string, fields: Partial<DomainConfigFields>) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  if (fields.beneficiaryVar) {
    const domain = await prisma.budgetDomainConfig.findUnique({ where: { id }, select: { city: true } });
    if (domain) await ensureBeneficiaryVar(domain.city, fields.beneficiaryVar);
  }
  await prisma.budgetDomainConfig.update({ where: { id }, data: fields });
  revalidatePath("/admin");
}

export async function toggleDomain(id: string, isActive: boolean) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await prisma.budgetDomainConfig.update({ where: { id }, data: { isActive } });
  revalidatePath("/admin");
}

export async function reorderDomains(city: string, orderedIds: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");
  await prisma.$transaction(
    orderedIds.map((id, position) => prisma.budgetDomainConfig.update({ where: { id }, data: { position } }))
  );
  revalidatePath("/admin");
}

export async function seedDomains(city: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const defaults = [
    { key: "Children",     label: "Children",                     description: "CLCs, after-school, camps",           position: 0, beneficiaryLabel: "Children",       beneficiaryVar: "nCLCs",        beneficiaryMult: 100 },
    { key: "Youth",        label: "Youth",                        description: "YRCs, Yuva Adda, sports",             position: 1, beneficiaryLabel: "Youth",          beneficiaryVar: "nYRCs",        beneficiaryMult: 200 },
    { key: "Elderly",      label: "Elderly + Community Kitchen",  description: "Day care, nutrition, community kitchen",position: 2, beneficiaryLabel: "Elderly",        beneficiaryVar: "nElderly",     beneficiaryMult: 1   },
    { key: "WelfareRights",label: "Welfare Rights",               description: "Entitlement & collectivization",       position: 3, beneficiaryLabel: "Households",     beneficiaryVar: "nSettlements", beneficiaryMult: 150 },
    { key: "Creche",       label: "Creche",                       description: "0–3 yr children, standard model", position: 4, beneficiaryLabel: "Creche children", beneficiaryVar: "nCreches",     beneficiaryMult: 20  },
  ];

  await prisma.$transaction(
    defaults.map(d =>
      prisma.budgetDomainConfig.upsert({
        where: { city_key: { city, key: d.key } },
        create: { city, isActive: true, ...d },
        update: {},
      })
    )
  );
  revalidatePath("/admin");
}

export async function seedLineTemplates(city: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const specs = getTemplatesForCity(city);
  await prisma.$transaction(
    specs.map((t, position) =>
      prisma.lineTemplate.upsert({
        where: { city_templateKey: { city, templateKey: t.templateKey } },
        update: {
          section:            t.section as never,
          description:        t.description,
          costCategory:       t.costCategory as never,
          unitType:           t.unitType,
          notes:              t.notes ?? null,
          salaryHint:         t.salaryHint ?? null,
          isAutoGenerated:    t.isAutoGenerated ?? true,
          domain:             (t.domain as never) ?? null,
          inputVar:           t.inputVar ?? "fixed_1",
          inputMonthly:       t.inputMonthly ?? false,
          supervisorRatioKey: t.supervisorRatioKey ?? null,
          isSalaryStub:       t.isSalaryStub ?? false,
          userInputCost:      t.userInputCost ?? null,
          costKey:            t.costKey ?? null,
          costKey2:           t.costKey2 ?? null,
          costKey3:           t.costKey3 ?? null,
          costMonthly:        t.costMonthly ?? false,
          workerRatioKey:     t.workerRatioKey ?? null,
          bufferKey:          t.bufferKey ?? null,
          costPctOf:          t.costPctOf ?? null,
          costPct:            t.costPct ?? null,
          y1UnitsZero:        t.y1UnitsZero ?? false,
        },
        create: {
          city,
          templateKey:        t.templateKey,
          position,
          section:            t.section as never,
          description:        t.description,
          costCategory:       t.costCategory as never,
          unitType:           t.unitType,
          notes:              t.notes ?? null,
          salaryHint:         t.salaryHint ?? null,
          isAutoGenerated:    t.isAutoGenerated ?? true,
          domain:             (t.domain as never) ?? null,
          inputVar:           t.inputVar ?? "fixed_1",
          inputMonthly:       t.inputMonthly ?? false,
          supervisorRatioKey: t.supervisorRatioKey ?? null,
          isSalaryStub:       t.isSalaryStub ?? false,
          userInputCost:      t.userInputCost ?? null,
          costKey:            t.costKey ?? null,
          costKey2:           t.costKey2 ?? null,
          costKey3:           t.costKey3 ?? null,
          costMonthly:        t.costMonthly ?? false,
          workerRatioKey:     t.workerRatioKey ?? null,
          bufferKey:          t.bufferKey ?? null,
          costPctOf:          t.costPctOf ?? null,
          costPct:            t.costPct ?? null,
          y1UnitsZero:        t.y1UnitsZero ?? false,
        },
      })
    )
  );
  revalidatePath("/admin");
}
