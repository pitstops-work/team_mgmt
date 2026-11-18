// Starter settings: Creche (spec §5). Source: templates creche-program,
// creche-program-existing, creche-program-existing-copy. Loaded once from the
// Programmes screen; after that the settings are edited there, not here.
import type { ProgrammeSettings } from "../settings";
import { CRECHE_SAFETY_24, CAREGIVER_PRACTICES } from "./creche-lists";

export const CRECHE: { key: string; name: string; settings: ProgrammeSettings } = {
  key: "creche",
  name: "Creche",
  settings: {
    description:
      "The partner runs the creche day to day and records it in Shishughar. The RP helps the partner set it up, then visits monthly and reviews fortnightly.",
    place_level: "site",
    partner_mis: "Shishughar",
    partner_optional: false,
    setup: [
      {
        phase: "Approval",
        items: [
          { key: "partner-identified", title: "Partner identified and oriented on the creche model", check: "tick", required: true, due_in_days: 14, applies_to: "new" },
          { key: "children-estimated", title: "Children 6 months–3 years estimated from secondary data", check: "number", reading: "children_6m_3y_estimate", required: true, due_in_days: 21, applies_to: "new" },
          { key: "creches-agreed", title: "Number of creches agreed", check: "number", reading: "creches_agreed", required: true, due_in_days: 28, applies_to: "new" },
          { key: "budget-proposal", title: "Budget and proposal prepared", check: "photo", required: true, due_in_days: 35, applies_to: "new" },
          { key: "budget-approved", title: "Budget approved", check: "tick", required: true, due_in_days: 40, applies_to: "new" },
          { key: "agreement-signed", title: "Agreement / addendum signed", check: "photo", required: true, due_in_days: 43, applies_to: "new" },
          { key: "first-tranche", title: "First tranche disbursed", check: "tick", required: true, due_in_days: 45, applies_to: "new" },
        ],
      },
      {
        phase: "Team",
        items: [
          { key: "staff-recruited", title: "Partner programme staff recruited", check: "tick", required: true, due_in_days: 55, applies_to: "new" },
          { key: "team-induction", title: "Team induction, orientation and exposure visit done", check: "voice", required: true, due_in_days: 60, applies_to: "new" },
          { key: "govt-informed", title: "Local government stakeholder informed", check: "tick", required: true, due_in_days: 60, applies_to: "new" },
        ],
      },
      {
        phase: "Space",
        items: [
          { key: "space-identified", title: "Suitable space identified", check: "photo", required: true, due_in_days: 63, applies_to: "new" },
          { key: "space-safety-check", title: "Space checked against the 24-point safety list; renovation needs listed", check: "rating", list: "safety_24", required: true, due_in_days: 65, applies_to: "new" },
          { key: "renovation-done", title: "Renovation complete", check: "photo", required: true, due_in_days: 72, applies_to: "new" },
          { key: "shishughar-profile", title: "Creche profile created in Shishughar", check: "tick", required: true, due_in_days: 74, applies_to: "new" },
          { key: "household-listing", title: "Household listing added to the creche in Shishughar", check: "tick", required: true, due_in_days: 75, applies_to: "new" },
        ],
      },
      {
        phase: "Community",
        items: [
          { key: "community-meeting", title: "Community meeting held in each slum where the creche starts", check: "voice", required: true, due_in_days: 85, applies_to: "new" },
          { key: "community-minutes", title: "Minutes / resolution and attendance on record", check: "photo", required: true, due_in_days: 90, applies_to: "new" },
        ],
      },
      {
        phase: "Caregivers",
        items: [
          { key: "caregivers-shortlisted", title: "Caregivers shortlisted on the 10-point criteria", check: "tick", required: true, due_in_days: 93, applies_to: "new" },
          { key: "background-check", title: "Background check done and documents collected", check: "tick", required: true, due_in_days: 95, applies_to: "new" },
        ],
      },
      {
        phase: "Procurement",
        items: [
          { key: "vendors-approved", title: "Vendors identified and approved", check: "tick", required: true, due_in_days: 95, applies_to: "new" },
          { key: "equipment-procured", title: "Equipment procured: growth monitoring, cooking, fire safety, first aid, bedding, play", check: "photo", required: true, due_in_days: 97, applies_to: "new" },
          { key: "lpg-account", title: "LPG commercial account set up", check: "tick", required: true, due_in_days: 97, applies_to: "new" },
          { key: "registers-collaterals", title: "Registers and collaterals procured", check: "tick", required: true, due_in_days: 97, applies_to: "new" },
          { key: "stock-register", title: "All procurement documented in the stock register", check: "photo", required: true, due_in_days: 97, applies_to: "new" },
        ],
      },
      {
        phase: "Training",
        items: [
          { key: "pre-service-training", title: "5-day residential pre-service training held", check: "voice", required: true, due_in_days: 102, applies_to: "new" },
          { key: "competency-assessment", title: "Competency assessment of all trainees", check: "number", reading: "trainees_passed_pct", required: true, due_in_days: 103, applies_to: "new" },
          { key: "materials-distributed", title: "Training materials and registers given to each caregiver", check: "tick", required: true, due_in_days: 103, applies_to: "new" },
        ],
      },
      {
        phase: "Launch",
        items: [
          { key: "facility-readiness", title: "Facility readiness: 24-point safety check", check: "rating", list: "safety_24", required: true, due_in_days: 104, applies_to: "new" },
          { key: "pre-opening-meeting", title: "Pre-opening community meeting; start date announced", check: "voice", required: true, due_in_days: 104, applies_to: "new" },
          { key: "materials-verified", title: "Collaterals, creche and play materials, drinking water and toilet verified", check: "tick", required: true, due_in_days: 105, applies_to: "new" },
          { key: "inaugurated", title: "Creche inaugurated and children enrolled", check: "number", reading: "children_enrolled", required: true, due_in_days: 105, applies_to: "new" },
        ],
      },
      {
        phase: "Health links",
        items: [
          { key: "anm-aww-asha", title: "Contact established with the local ANM, AWW and ASHA", check: "tick", required: true, due_in_days: 106, applies_to: "new" },
          { key: "growth-schedule", title: "Growth monitoring schedule verified", check: "tick", required: true, due_in_days: 106, applies_to: "new" },
          { key: "referral-pathways", title: "Referral pathways to PHC/CHC/clinic and NRC set", check: "tick", required: true, due_in_days: 106, applies_to: "new" },
          { key: "abc-alerts-briefed", title: "Caregivers briefed on Category A/B/C health alert protocols", check: "voice", required: true, due_in_days: 106, applies_to: "new" },
        ],
      },
    ],
    routines: [
      {
        key: "creche-visit",
        name: "Creche visit",
        cadence: "monthly",
        mode: "visit",
        items: [
          { key: "safety-audit", title: "Safety and hygiene: 24-point check", check: "rating", list: "safety_24", required: true },
          { key: "caregiver-practices", title: "Caregiver practices observed", check: "observation", list: "caregiver_practices", required: true },
          { key: "health-referrals", title: "Health referrals followed through", check: "tick", required: true },
          { key: "mis-matches", title: "Shishughar register matches what I saw", check: "note", required: true, hint: "Note anything that doesn't match." },
          { key: "children-enrolled", title: "Children enrolled (from Shishughar)", check: "number", reading: "children_enrolled", required: true },
          { key: "avg-attendance", title: "Average daily attendance (from Shishughar)", check: "number", reading: "avg_daily_attendance", required: true },
          { key: "underweight", title: "Children underweight (from Shishughar)", check: "number", reading: "children_underweight", required: false },
          { key: "referrals-open", title: "Health referrals still open (from Shishughar)", check: "number", reading: "referrals_open", required: false },
        ],
      },
      {
        key: "supervisor-review",
        name: "Supervisor & caregiver review",
        cadence: "fortnightly",
        mode: "call",
        items: [
          { key: "mis-crosscheck", title: "Shishughar data cross-checked with the field register before the call", check: "tick", required: true },
          { key: "review-held", title: "Review held with the partner supervisor and caregivers", check: "voice", required: true },
          { key: "actions-agreed", title: "Action items agreed and shared", check: "note", required: true, hint: "Raise a partner follow-up for each action." },
        ],
      },
    ],
    readings: [
      { key: "children_enrolled", label: "Children enrolled", outcome: true },
      { key: "avg_daily_attendance", label: "Average daily attendance", outcome: false },
      { key: "children_underweight", label: "Children underweight", outcome: false },
      { key: "referrals_open", label: "Health referrals open", outcome: false },
      { key: "children_6m_3y_estimate", label: "Children 6m–3y (estimate)", outcome: false },
      { key: "creches_agreed", label: "Creches agreed", outcome: false },
      { key: "trainees_passed_pct", label: "Trainees passing competency", unit: "%", outcome: false },
    ],
    lists: {
      safety_24: CRECHE_SAFETY_24,
      caregiver_practices: CAREGIVER_PRACTICES,
    },
    dimensions: {},
    need: { type: "count", population: "children6m3yr", per_unit: 20, existing: "existingCreches" },
    integration: { source: "shishughar", notes: "Readings typed in at the visit for now; a sync can write the same reading keys later." },
  },
};

/** The monthly meeting of every creche partner in a city: one city-level effort (spec Q4). */
export const CRECHE_PARTNER_MEETING: { key: string; name: string; settings: ProgrammeSettings } = {
  key: "creche-partner-meeting",
  name: "Creche all-partner meeting",
  settings: {
    description: "The monthly meeting of all creche partners in a city, facilitated by the creche team.",
    place_level: "city",
    partner_optional: true,
    setup: [],
    routines: [
      {
        key: "all-partner-meeting",
        name: "All-partner meeting",
        cadence: "monthly",
        mode: "meeting",
        items: [
          { key: "meeting-facilitated", title: "Monthly all-partner meeting facilitated", check: "voice", required: true },
          { key: "actions-shared", title: "Actions shared with every partner", check: "note", required: true },
        ],
      },
    ],
    readings: [],
    lists: {},
    dimensions: {},
  },
};
