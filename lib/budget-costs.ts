// Canonical cost registry defaults — seeded into DB, editable via admin page.
// itemKey format: "domain.parameter" (domain lowercase)

import type { BudgetDomain } from "@/app/generated/prisma/client";

export type CostItem = {
  domain: BudgetDomain | null;
  itemKey: string;
  unitCost: number;
  unit: string;
  notes?: string;
};

export const DEFAULT_COSTS: CostItem[] = [
  // ── Children ────────────────────────────────────────────────────────────────
  { domain: "Children", itemKey: "children.snack_per_child_per_day",       unitCost: 12,     unit: "₹/child/day",         notes: "Breakfast or evening snack at CLC" },
  { domain: "Children", itemKey: "children.snack_days_per_year",           unitCost: 180,    unit: "days",                notes: "Working days CLC operates" },
  { domain: "Children", itemKey: "children.children_per_clc",              unitCost: 100,    unit: "children",            notes: "Enrolment per CLC" },
  { domain: "Children", itemKey: "children.leisure_material_per_day",      unitCost: 12,     unit: "₹/child/day",         notes: "Art & craft materials per child" },
  { domain: "Children", itemKey: "children.leisure_days_per_year",         unitCost: 26,     unit: "days" },
  { domain: "Children", itemKey: "children.parent_session_per_person",     unitCost: 90,     unit: "₹/person/session",    notes: "Refreshment at parent meetings" },
  { domain: "Children", itemKey: "children.parent_sessions_per_year",      unitCost: 4,      unit: "sessions" },
  { domain: "Children", itemKey: "children.parents_per_centre",            unitCost: 200,    unit: "parents" },
  { domain: "Children", itemKey: "children.social_awareness_per_event",    unitCost: 5000,   unit: "₹/event" },
  { domain: "Children", itemKey: "children.social_awareness_events",       unitCost: 6,      unit: "events/year/CLC" },
  { domain: "Children", itemKey: "children.exposure_visit_per_child",      unitCost: 500,    unit: "₹/child",             notes: "Travel + food + entry fee" },
  { domain: "Children", itemKey: "children.exposure_children",             unitCost: 100,    unit: "children" },
  { domain: "Children", itemKey: "children.camp_cost",                     unitCost: 37500,  unit: "₹/camp",              notes: "Food + resource person + materials for 5 days" },
  { domain: "Children", itemKey: "children.camps_per_year",                unitCost: 2,      unit: "camps/year" },
  { domain: "Children", itemKey: "children.leadership_training_cost",      unitCost: 37500,  unit: "₹/year/CLC" },
  { domain: "Children", itemKey: "children.education_materials_cost",      unitCost: 40000,  unit: "₹/year/CLC",          notes: "TLM, worksheets, audio-visual" },
  { domain: "Children", itemKey: "children.profiling_external_training",   unitCost: 25000,  unit: "₹/year/CLC" },
  { domain: "Children", itemKey: "children.clc_setup_cost",                unitCost: 25000,  unit: "₹/CLC",               notes: "Painting, civil works (one-time)" },
  { domain: "Children", itemKey: "children.staff_exposure_visit_cost",     unitCost: 40600,  unit: "₹/CLC",               notes: "Staff exposure trip per CLC" },

  // ── Youth ────────────────────────────────────────────────────────────────────
  { domain: "Youth",    itemKey: "youth.small_group_meeting_per_month",    unitCost: 500,    unit: "₹/worker/month",      notes: "Tea & snacks, 10 meetings × 20 youth" },
  { domain: "Youth",    itemKey: "youth.yuva_adda_cost_per_workshop",      unitCost: 9000,   unit: "₹/workshop",          notes: "Resource person + food + venue" },
  { domain: "Youth",    itemKey: "youth.yuva_adda_workshops_per_year",     unitCost: 8,      unit: "workshops/year/YRC" },
  { domain: "Youth",    itemKey: "youth.leadership_training_cost",         unitCost: 18000,  unit: "₹/training" },
  { domain: "Youth",    itemKey: "youth.leadership_trainings_per_year",    unitCost: 2,      unit: "per year" },
  { domain: "Youth",    itemKey: "youth.felicitation_cost",                unitCost: 20000,  unit: "₹/event" },
  { domain: "Youth",    itemKey: "youth.felicitations_per_year",           unitCost: 2,      unit: "per year" },
  { domain: "Youth",    itemKey: "youth.sports_event_cost",                unitCost: 47500,  unit: "₹/event" },
  { domain: "Youth",    itemKey: "youth.sports_events_per_year",           unitCost: 2,      unit: "per year" },
  { domain: "Youth",    itemKey: "youth.youth_festival_cost",              unitCost: 40000,  unit: "₹/year/YRC" },
  { domain: "Youth",    itemKey: "youth.community_exposure_cost",          unitCost: 75000,  unit: "₹/year/YRC" },
  { domain: "Youth",    itemKey: "youth.staff_exposure_visit_cost",        unitCost: 36700,  unit: "₹/YRC" },

  // ── Elderly + Community Kitchen ───────────────────────────────────────────
  { domain: "Elderly",  itemKey: "elderly.nutrition_per_person_per_day",   unitCost: 90,     unit: "₹/person/day",        notes: "Day care meals, 25 days/month" },
  { domain: "Elderly",  itemKey: "elderly.nutrition_days_per_month",       unitCost: 25,     unit: "days" },
  { domain: "Elderly",  itemKey: "elderly.dry_ration_per_person_per_month",unitCost: 450,    unit: "₹/person/month" },
  { domain: "Elderly",  itemKey: "elderly.vegetable_per_person_per_month", unitCost: 400,    unit: "₹/person/month",      notes: "Community kitchen vegetables" },
  { domain: "Elderly",  itemKey: "elderly.gas_refill_cost",                unitCost: 10000,  unit: "₹/refill",            notes: "Bi-monthly refill" },
  { domain: "Elderly",  itemKey: "elderly.gas_refills_per_year",           unitCost: 6,      unit: "refills/year" },
  { domain: "Elderly",  itemKey: "elderly.meeting_refreshment_per_person", unitCost: 100,    unit: "₹/person/meeting" },
  { domain: "Elderly",  itemKey: "elderly.elderly_per_meeting",            unitCost: 30,     unit: "persons" },
  { domain: "Elderly",  itemKey: "elderly.annual_day_cost",                unitCost: 17000,  unit: "₹/event" },
  { domain: "Elderly",  itemKey: "elderly.annual_days_per_year",           unitCost: 2,      unit: "per year" },
  { domain: "Elderly",  itemKey: "elderly.volunteer_honorarium_per_month", unitCost: 3600,   unit: "₹/volunteer/month" },
  { domain: "Elderly",  itemKey: "elderly.volunteers_per_centre",          unitCost: 5,      unit: "volunteers" },
  { domain: "Elderly",  itemKey: "elderly.kitchen_incharge_travel",        unitCost: 3000,   unit: "₹/month" },
  { domain: "Elderly",  itemKey: "elderly.centre_setup_cost",              unitCost: 20000,  unit: "₹/centre",            notes: "Beds, utensils, linen (one-time)" },
  { domain: "Elderly",  itemKey: "elderly.misc_contingency_per_centre",    unitCost: 60000,  unit: "₹/year/centre" },

  // ── Welfare Rights ────────────────────────────────────────────────────────
  { domain: "WelfareRights", itemKey: "wr.slum_meeting_refreshment",       unitCost: 15,     unit: "₹/person/meeting" },
  { domain: "WelfareRights", itemKey: "wr.slum_meeting_participants",      unitCost: 20,     unit: "persons" },
  { domain: "WelfareRights", itemKey: "wr.cluster_meeting_refreshment",    unitCost: 60,     unit: "₹/person/meeting" },
  { domain: "WelfareRights", itemKey: "wr.cluster_meeting_participants",   unitCost: 30,     unit: "persons" },
  { domain: "WelfareRights", itemKey: "wr.city_training_cost",             unitCost: 19000,  unit: "₹/year" },
  { domain: "WelfareRights", itemKey: "wr.city_meeting_cost",              unitCost: 16000,  unit: "₹/year" },
  { domain: "WelfareRights", itemKey: "wr.community_exposure_per_leader",  unitCost: 500,    unit: "₹/leader" },
  { domain: "WelfareRights", itemKey: "wr.leaders_per_cluster",            unitCost: 50,     unit: "leaders" },
  { domain: "WelfareRights", itemKey: "wr.entitlement_camp_per_settlement",unitCost: 240,    unit: "₹/settlement" },
  { domain: "WelfareRights", itemKey: "wr.consultation_cost",              unitCost: 20000,  unit: "₹/year" },
  { domain: "WelfareRights", itemKey: "wr.governance_cost_per_cluster",    unitCost: 3000,   unit: "₹/cluster" },

  // ── Creche ────────────────────────────────────────────────────────────────
  { domain: "Creche",   itemKey: "creche.worker_honorarium_per_month",     unitCost: 12000,  unit: "₹/worker/month" },
  { domain: "Creche",   itemKey: "creche.workers_per_creche",              unitCost: 2,      unit: "workers" },
  { domain: "Creche",   itemKey: "creche.maternity_buffer_pct",            unitCost: 10,     unit: "%",                   notes: "Extra % added to honorarium for maternity" },
  { domain: "Creche",   itemKey: "creche.children_per_creche",             unitCost: 20,     unit: "children" },
  { domain: "Creche",   itemKey: "creche.feeding_cost_per_child_per_year", unitCost: 89561,  unit: "₹/child/year",        notes: "Breakfast + lunch + evening snack" },
  { domain: "Creche",   itemKey: "creche.egg_cost_per_year",               unitCost: 40560,  unit: "₹/creche/year",       notes: "6 eggs/week × ₹6.50 × 20 children" },
  { domain: "Creche",   itemKey: "creche.gas_cost_per_year",               unitCost: 12000,  unit: "₹/creche/year",       notes: "₹1,000/month" },
  { domain: "Creche",   itemKey: "creche.hygiene_cost_per_year",           unitCost: 10720,  unit: "₹/creche/year",       notes: "Soap, detergent, mops, stationary" },
  { domain: "Creche",   itemKey: "creche.food_transport_per_year",         unitCost: 12000,  unit: "₹/creche/year",       notes: "₹1,000/month" },
  { domain: "Creche",   itemKey: "creche.play_materials_per_year",         unitCost: 9500,   unit: "₹/creche/year" },
  { domain: "Creche",   itemKey: "creche.flexi_fund_per_year",             unitCost: 5359,   unit: "₹/creche/year" },
  { domain: "Creche",   itemKey: "creche.training_cost_per_year",          unitCost: 33600,  unit: "₹/creche/year",       notes: "Training + monthly review meetings" },
  { domain: "Creche",   itemKey: "creche.caregiver_food_per_year",         unitCost: 15600,  unit: "₹/creche/year",       notes: "₹1,300/month × 2 caregivers" },
  { domain: "Creche",   itemKey: "creche.setup_cost",                      unitCost: 131000, unit: "₹/creche",            notes: "Anthropometric equipment + utensils + linen (one-time)" },
  { domain: "Creche",   itemKey: "creche.supervisor_salary_per_month",     unitCost: 25000,  unit: "₹/month" },
  { domain: "Creche",   itemKey: "creche.coordinator_salary_per_month",    unitCost: 35000,  unit: "₹/month" },
  { domain: "Creche",   itemKey: "creche.supervisor_per_n_creches",        unitCost: 10,     unit: "creches per supervisor" },
  { domain: "Creche",   itemKey: "creche.coordinator_per_n_creches",       unitCost: 40,     unit: "creches per coordinator" },
  { domain: "Creche",   itemKey: "creche.supervisor_travel_per_month",     unitCost: 3750,   unit: "₹/supervisor/month" },
  { domain: "Creche",   itemKey: "creche.coordinator_travel_per_month",    unitCost: 6000,   unit: "₹/coordinator/month" },

  // ── Youth (additional) ────────────────────────────────────────────────────
  { domain: "Youth",    itemKey: "youth.social_actions_per_yrc",           unitCost: 3000,   unit: "₹/YRC/year",          notes: "Youth-led social actions" },
  { domain: "Youth",    itemKey: "youth.stationery_per_yrc",               unitCost: 1500,   unit: "₹/YRC/year",          notes: "Stationery, IEC, photocopy & printing" },

  // ── Welfare Rights (additional) ───────────────────────────────────────────
  { domain: "WelfareRights", itemKey: "wr.dept_interaction_per_cluster",   unitCost: 3000,   unit: "₹/cluster/year",      notes: "Travel for interaction with departments" },
  { domain: "WelfareRights", itemKey: "wr.special_occasions_cost",         unitCost: 10000,  unit: "₹/year",              notes: "Observation of special occasions" },
  { domain: "WelfareRights", itemKey: "wr.civic_baseline_cost",            unitCost: 50000,  unit: "₹/year",              notes: "Civic community baseline survey" },

  // ── Cross-cutting ─────────────────────────────────────────────────────────
  { domain: null,       itemKey: "cross.staff_capacity_building",          unitCost: 14480,  unit: "₹/year" },
  { domain: null,       itemKey: "cross.team_building_offsite",            unitCost: 204600, unit: "₹/year",              notes: "3-day offsite" },
  { domain: null,       itemKey: "cross.planning_review_meetings",         unitCost: 5400,   unit: "₹/year" },
  { domain: null,       itemKey: "cross.crisis_intervention",              unitCost: 2500,   unit: "₹/year" },
];

// Lookup helper — returns the unitCost for a given itemKey from the seeded/edited registry,
// falling back to DEFAULT_COSTS if not found.
export function lookupCost(
  registry: Record<string, number>,
  itemKey: string,
  fallback?: number
): number {
  if (registry[itemKey] !== undefined) return registry[itemKey];
  const def = DEFAULT_COSTS.find(c => c.itemKey === itemKey);
  return def?.unitCost ?? fallback ?? 0;
}
