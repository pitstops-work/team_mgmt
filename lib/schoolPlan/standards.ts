// Standard-cost annexure values (per-school, Year-1, in ₹) from
// "Afterschool centre Annexure Costing 2.xlsx". Seeded into CostRegistry under
// the "AfterSchoolCentre" domain by scripts/seed-school-plan.ts. Used by
// lib/schoolPlan/rules.ts to compute deviation vs. school-specific figures.
//
// Inflation categories (per annexure Instructions sheet):
//   Salary → 10% p.a., Other → 5% p.a., Nil → 0%.
// Food/snacks is intentionally tagged Salary despite being a programme expense
// (see the extraction note under §5 "Key rules").

export type StandardLine = {
  itemKey: string;
  section: "capex" | "salary" | "travel" | "programme";
  description: string;
  unitCost: number;              // ₹, Y1
  unit: string;                  // "school (annual)" | "month" | "day" | "one-time"
  units: number;                 // Y1 units
  inflation: "Salary" | "Other" | "Nil";
  notes?: string;
};

// Capex — Y1 one-time, no inflation. Annexure Capex sub-total = ₹87,00,000.
export const STANDARD_CAPEX: StandardLine[] = [
  { itemKey: "asc.capex.design",             section: "capex", description: "Design (architecture fees)",    unitCost:  500000, unit: "one-time", units: 1, inflation: "Nil" },
  { itemKey: "asc.capex.refurbishment",      section: "capex", description: "Refurbishment / civil works",   unitCost: 5000000, unit: "one-time", units: 1, inflation: "Nil", notes: "May not be uniform — higher-end estimate" },
  { itemKey: "asc.capex.creche",             section: "capex", description: "Crèche conversion civil works", unitCost:  200000, unit: "one-time", units: 1, inflation: "Nil" },
  { itemKey: "asc.capex.activity_resources", section: "capex", description: "Resources for activity",        unitCost: 2000000, unit: "one-time", units: 1, inflation: "Nil", notes: "Computers, sports, other" },
  { itemKey: "asc.capex.learning_materials", section: "capex", description: "Learning materials",            unitCost: 1000000, unit: "one-time", units: 1, inflation: "Nil", notes: "Books, kits, art & other" },
];

// Salary / honorarium / benefits — 10% p.a. inflation. Sub-total = ₹74,76,000.
// Unit cost = monthly rate; units = person-months in Y1.
export const STANDARD_SALARY: StandardLine[] = [
  { itemKey: "asc.opex.school_coordinator", section: "salary", description: "School Coordinator",     unitCost: 65000, unit: "month",  units: 12, inflation: "Salary" },
  { itemKey: "asc.opex.librarian",          section: "salary", description: "Librarian",              unitCost: 35000, unit: "month",  units: 12, inflation: "Salary" },
  { itemKey: "asc.opex.art_coordinator",    section: "salary", description: "Art coordinator",        unitCost: 35000, unit: "month",  units: 12, inflation: "Salary" },
  { itemKey: "asc.opex.sports_coordinator", section: "salary", description: "Sports coordinator",     unitCost: 35000, unit: "month",  units: 12, inflation: "Salary" },
  { itemKey: "asc.opex.science_instructor", section: "salary", description: "Science lab instructor", unitCost: 35000, unit: "month",  units: 12, inflation: "Salary" },
  { itemKey: "asc.opex.computer_instructor",section: "salary", description: "Computer instructor",    unitCost: 35000, unit: "month",  units: 12, inflation: "Salary" },
  { itemKey: "asc.opex.security",           section: "salary", description: "Security (6 guards × 3 shifts)", unitCost: 25000, unit: "month",  units: 72, inflation: "Salary", notes: "6 person-months per month × 12 months" },
  { itemKey: "asc.opex.facility_mgmt",      section: "salary", description: "Facility management / housekeeping (8 people)", unitCost: 25000, unit: "month", units: 96, inflation: "Salary" },
  { itemKey: "asc.opex.outreach",           section: "salary", description: "Outreach workers (2 × 12 mo)",  unitCost: 16500, unit: "month",  units: 24, inflation: "Salary", notes: "1 per 150–200 children" },
];

// Travel — "Other" 5% inflation category on the annexure. Sub-total = ₹36,000.
export const STANDARD_TRAVEL: StandardLine[] = [
  { itemKey: "asc.opex.travel_school_coord", section: "travel", description: "Local travel — school coordinator", unitCost: 3000, unit: "month", units: 12, inflation: "Other" },
];

// Programme expenses — mostly "Other" 5%. Sub-total = ₹33,67,285.
// Food/snacks is tagged Salary 10% per the annexure (intentional).
export const STANDARD_PROGRAMME: StandardLine[] = [
  { itemKey: "asc.opex.creche_ops",        section: "programme", description: "Crèche operations (Urban Crèche V.2 standard)",     unitCost: 858335,   unit: "annual",  units: 1,   inflation: "Other" },
  { itemKey: "asc.opex.activity_resources",section: "programme", description: "Resources for each activity (incl. child profiling + staff training)", unitCost: 57913, unit: "month", units: 12,  inflation: "Other" },
  { itemKey: "asc.opex.utilities",         section: "programme", description: "Utilities & maintenance",                            unitCost: 41667,    unit: "month",   units: 12,  inflation: "Other", notes: "Cleaning, consumables" },
  { itemKey: "asc.opex.food_snacks",       section: "programme", description: "Food / snacks (₹12/child/day × 300 × 365)",          unitCost: 3600,     unit: "day",     units: 365, inflation: "Salary", notes: "Auto-scales with targetChildrenPerDay in each school's budget" },
];

export const STANDARD_ALL: StandardLine[] = [
  ...STANDARD_CAPEX,
  ...STANDARD_SALARY,
  ...STANDARD_TRAVEL,
  ...STANDARD_PROGRAMME,
];

export const STANDARD_RECURRING_ITEM_KEYS = new Set(
  [...STANDARD_SALARY, ...STANDARD_TRAVEL, ...STANDARD_PROGRAMME].map((l) => l.itemKey),
);

/** ₹ standard totals from the annexure. Cross-check against ₹1,95,79,285 Y1. */
export const STANDARD_TOTALS_Y1 = {
  capexRupees:     STANDARD_CAPEX.reduce((s, l) => s + l.unitCost * l.units, 0),         //  87,00,000
  salaryRupees:    STANDARD_SALARY.reduce((s, l) => s + l.unitCost * l.units, 0),        //  74,76,000
  travelRupees:    STANDARD_TRAVEL.reduce((s, l) => s + l.unitCost * l.units, 0),        //     36,000
  programmeRupees: STANDARD_PROGRAMME.reduce((s, l) => s + l.unitCost * l.units, 0),     //  33,67,285
  get recurringRupees() { return this.salaryRupees + this.travelRupees + this.programmeRupees; }, // 108,79,285
  get totalRupees()     { return this.capexRupees + this.recurringRupees; },                       // 195,79,285
};

export const STANDARD_UNIT_COST_PER_CHILD_PER_YEAR = 36000; // ₹36,000 — the GC threshold reference
export const FOOD_RATE_PER_CHILD_PER_DAY = 12;              // ₹12
export const DEVIATION_THRESHOLD_PCT = 10;                  // 10% → GC re-approval
