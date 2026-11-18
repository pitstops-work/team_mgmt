// Starter settings: Welfare Rights and the Scheme Linkage drive (spec §6).
// Sources: welfare-rights-copy ("new" → setup for new clusters) and
// welfare-rights-temp ("temporary" → the current model for running
// programmes, and the catch-up items for already-running clusters).
// welfare-rights ("existing") is superseded and not carried over.
import type { ProgrammeSettings } from "../settings";

/** Schemes and the documents behind them. One list, shared by both programmes. */
const SCHEMES = [
  { key: "cmchis", label: "CMCHIS" },
  { key: "pmjay", label: "PMJAY" },
  { key: "pmjjby", label: "PMJJBY" },
  { key: "pmsby", label: "PMSBY" },
  { key: "apy", label: "APY" },
  { key: "welfare-pension", label: "Welfare pensions" },
  { key: "pmay", label: "PMAY" },
  { key: "voter-id", label: "Voter ID" },
  { key: "aadhaar", label: "Aadhaar" },
  { key: "income-certificate", label: "Income certificate" },
  { key: "ration-card", label: "Ration card" },
  { key: "jan-dhan", label: "Jan Dhan account" },
];

export const WELFARE_RIGHTS: { key: string; name: string; settings: ProgrammeSettings } = {
  key: "welfare-rights",
  name: "Welfare Rights",
  settings: {
    description:
      "The partner team (COs, cluster coordinators, ASHA) runs community groups, MAS, grievance forums, civic mapping and entitlement applications, recorded in Frappe. The RP sets the team up, then reviews weekly and validates in the field.",
    place_level: "cluster",
    partner_mis: "Frappe",
    partner_optional: false,
    setup: [
      {
        phase: "Team",
        items: [
          { key: "team-recruited", title: "Partner team recruited: PM, cluster coordinators, RCCs, MIS coordinator, COs", check: "number", reading: "cos_in_place", required: true, due_in_days: 21, applies_to: "new", hint: "Enter the number of COs in place." },
          { key: "team-induction", title: "Team induction and orientation held", check: "voice", required: true, due_in_days: 21, applies_to: "new" },
          { key: "co-assignment", title: "COs assigned to clusters and settlements", check: "tick", required: true, due_in_days: 21, applies_to: "new" },
          { key: "team-rhythm", title: "Team communication channel and review rhythm set", check: "tick", required: true, due_in_days: 21, applies_to: "new" },
        ],
      },
      {
        phase: "Mapping",
        items: [
          { key: "households-enumerated", title: "Settlements listed and households enumerated", check: "number", reading: "households_enumerated", required: true, due_in_days: 35, applies_to: "new" },
          { key: "groups-mapped", title: "Existing community groups mapped (active / inactive / absent)", check: "number", reading: "groups_mapped", required: true, due_in_days: 35, applies_to: "new" },
          { key: "mas-mapped", title: "Existing MAS groups mapped", check: "number", reading: "mas_mapped", required: true, due_in_days: 35, applies_to: "new" },
          { key: "govt-infra-located", title: "PHC, Anganwadi, government schools and police station located", check: "tick", required: true, due_in_days: 35, applies_to: "new" },
          { key: "leaders-identified", title: "Key community leaders identified in each settlement", check: "tick", required: true, due_in_days: 35, applies_to: "new" },
        ],
      },
      {
        phase: "CO training",
        items: [
          { key: "co-orientation", title: "3-day CO orientation held", check: "voice", required: true, due_in_days: 45, applies_to: "new" },
          { key: "tools-distributed", title: "Mapping tools, registers and app access given to all COs", check: "tick", required: true, due_in_days: 45, applies_to: "new" },
          { key: "training-calendar", title: "Year-1 monthly training calendar shared with COs", check: "photo", required: true, due_in_days: 45, applies_to: "new" },
        ],
      },
      {
        phase: "MIS live",
        items: [
          { key: "app-accounts", title: "App installed and accounts created for all COs and coordinators", check: "tick", required: true, due_in_days: 50, applies_to: "new" },
          { key: "data-entry-training", title: "COs trained on data entry, entitlement tracking and DV reporting", check: "voice", required: true, due_in_days: 55, applies_to: "new" },
          { key: "dashboards-configured", title: "Coordinator dashboard and MAS module configured", check: "tick", required: true, due_in_days: 55, applies_to: "new" },
          { key: "data-quality-review", title: "First data-quality review (2 weeks after go-live)", check: "note", required: true, due_in_days: 60, applies_to: "new" },
          { key: "reporting-rhythm", title: "Monthly MIS reporting rhythm set", check: "tick", required: true, due_in_days: 60, applies_to: "new" },
        ],
      },
      {
        phase: "Baselines",
        items: [
          { key: "civic-mapping-training", title: "COs trained on the civic-amenities mapping tool and app", check: "voice", required: true, due_in_days: 50, due_in_days_running: 1, applies_to: "both" },
          { key: "civic-mapping-rollout", title: "Civic-amenities mapping rollout visited (7 categories, all settlements)", check: "tick", required: true, due_in_days: 60, due_in_days_running: 7, applies_to: "both" },
          { key: "civic-other-issues", title: "Other settlement-specific civic issues mapped", check: "tick", required: true, due_in_days: 70, due_in_days_running: 10, applies_to: "both" },
          { key: "civic-findings", title: "Compiled mapping findings reviewed", check: "photo", required: true, due_in_days: 80, due_in_days_running: 15, applies_to: "both" },
          { key: "civic-reports-shared", title: "Settlement reports shared with community groups and coordinators", check: "tick", required: true, due_in_days: 85, due_in_days_running: 16, applies_to: "both" },
          { key: "civic-top-issues", title: "Top 3 issues per settlement prioritised", check: "note", required: true, due_in_days: 90, due_in_days_running: 20, applies_to: "both" },
          { key: "linelisting", title: "Household line-listing done and validated on the ground", check: "tick", required: true, due_in_days: 90, applies_to: "new" },
          { key: "eligible-per-scheme", title: "Eligible households recorded for each scheme", check: "number", reading: "eligible_households", required: true, due_in_days: 90, due_in_days_running: 30, applies_to: "both", hint: "From the line-listing in Frappe; one figure per scheme." },
        ],
      },
    ],
    routines: [
      {
        key: "cluster-review",
        name: "Cluster review",
        cadence: "weekly",
        mode: "meeting",
        items: [
          { key: "groups", title: "Each settlement has a community group meeting to guideline", check: "note", required: true },
          { key: "gbv", title: "GBV incidents reported and the plan of action", check: "note", required: true },
          { key: "mas", title: "MAS groups formed, gaps, challenges, next steps", check: "note", required: true },
          { key: "leaders", title: "Community leaders: status; monthly leaders' meeting planned", check: "note", required: true },
          { key: "federation", title: "Federation of groups (cluster and city): roadmap and status", check: "note", required: false },
          { key: "applications", title: "Scheme applications reviewed in Frappe", check: "number", reading: "applications_filed", required: true, hint: "One figure per scheme." },
          { key: "received", title: "Entitlements received (from Frappe)", check: "number", reading: "entitlements_received", required: true, hint: "One figure per scheme." },
          { key: "actions", title: "Actions agreed", check: "note", required: true, hint: "Raise a partner follow-up for each action." },
        ],
      },
      {
        key: "land-housing",
        name: "Land title & housing rights",
        cadence: "monthly",
        mode: "meeting",
        items: [
          { key: "co-land-training", title: "COs trained on land-title eligibility and the application process", check: "voice", required: true },
          { key: "eligible-households", title: "Eligible households identified per settlement", check: "number", reading: "land_eligible_households", required: true },
          { key: "applications-status", title: "Monthly applications status, challenges and follow-up plan reviewed", check: "note", required: true },
          { key: "filed", title: "Housing applications filed (from Frappe)", check: "number", reading: "housing_applications_filed", required: true },
          { key: "resolved", title: "Housing applications resolved (from Frappe)", check: "number", reading: "housing_applications_resolved", required: true },
        ],
      },
    ],
    readings: [
      { key: "eligible_households", label: "Eligible households", per: "scheme", outcome: false },
      { key: "applications_filed", label: "Applications filed", per: "scheme", outcome: false },
      { key: "entitlements_received", label: "Entitlements received", per: "scheme", outcome: true },
      { key: "active_groups", label: "Active community groups", outcome: false },
      { key: "mas_active", label: "Active MAS groups", outcome: false },
      { key: "gbv_cases_open", label: "GBV cases open", outcome: false },
      { key: "gbv_referrals", label: "GBV referrals", outcome: false },
      { key: "land_eligible_households", label: "Households eligible for land title", outcome: false },
      { key: "housing_applications_filed", label: "Housing applications filed", outcome: false },
      { key: "housing_applications_resolved", label: "Housing applications resolved", outcome: false },
      { key: "cos_in_place", label: "COs in place", outcome: false },
      { key: "households_enumerated", label: "Households enumerated", outcome: false },
      { key: "groups_mapped", label: "Community groups mapped", outcome: false },
      { key: "mas_mapped", label: "MAS groups mapped", outcome: false },
    ],
    lists: {},
    dimensions: { scheme: SCHEMES },
    need: { type: "saturation", eligible: "eligible_households", received: "entitlements_received", per: "scheme" },
    integration: { source: "frappe", notes: "Readings typed in at the review for now; a Frappe sync can write the same reading keys later." },
  },
};

/** A time-boxed drive: setup only, no routines; closes with a written review. */
export const SCHEME_LINKAGE: { key: string; name: string; settings: ProgrammeSettings } = {
  key: "scheme-linkage",
  name: "Scheme Linkage drive",
  settings: {
    description:
      "A CO-led household campaign to maximise entitlement coverage: workflow, MIS, training, quick wins, complex cases, closure. Runs alongside the cluster's Welfare Rights effort.",
    place_level: "cluster",
    partner_mis: "Frappe",
    partner_optional: false,
    setup: [
      {
        phase: "Workflow",
        items: [
          { key: "sample-cases", title: "Sample cases identified to apply", check: "photo", required: true, due_in_days: 10, applies_to: "both" },
          { key: "workflow-document", title: "Workflow document drafted, reviewed internally and shared", check: "photo", required: true, due_in_days: 14, applies_to: "both" },
        ],
      },
      {
        phase: "MIS ready",
        items: [
          { key: "frappe-updated", title: "Frappe doctype and dashboards updated", check: "tick", required: true, due_in_days: 25, applies_to: "both" },
          { key: "mis-pilot", title: "Piloted with a small team; validated in the field", check: "voice", required: true, due_in_days: 30, applies_to: "both" },
          { key: "mis-live", title: "Live, with field fixes applied in Frappe", check: "tick", required: true, due_in_days: 35, applies_to: "both" },
        ],
      },
      {
        phase: "Training",
        items: [
          { key: "staff-orientation", title: "Orientation for all relevant staff", check: "voice", required: true, due_in_days: 42, applies_to: "both" },
        ],
      },
      {
        phase: "Quick wins",
        items: [
          { key: "cases-segregated", title: "Cases that can be completed now targeted; complex cases separated", check: "number", reading: "cases_simple", required: true, due_in_days: 50, applies_to: "both", hint: "Enter the number of simple cases." },
          { key: "complex-count", title: "Complex cases counted", check: "number", reading: "cases_complex", required: true, due_in_days: 50, applies_to: "both" },
          { key: "handholding-rhythm", title: "Handholding and catch-up rhythm in place", check: "note", required: true, due_in_days: 72, applies_to: "both" },
        ],
      },
      {
        phase: "Complex cases",
        items: [
          { key: "complexity-reasons", title: "Reasons for complexity synthesised", check: "note", required: true, due_in_days: 90, applies_to: "both" },
          { key: "workflow-refined", title: "Workflow refined in Frappe from field insights", check: "tick", required: true, due_in_days: 102, applies_to: "both" },
        ],
      },
      {
        phase: "Closure",
        items: [
          { key: "incomplete-validated", title: "Reasons for cases still incomplete validated", check: "note", required: true, due_in_days: 105, applies_to: "both" },
          { key: "final-applied", title: "Final figures: applications made", check: "number", reading: "drive_applied", required: true, due_in_days: 108, applies_to: "both", hint: "One figure per scheme." },
          { key: "final-received", title: "Final figures: entitlements received", check: "number", reading: "drive_received", required: true, due_in_days: 108, applies_to: "both", hint: "One figure per scheme." },
          { key: "closure-review", title: "Drive closed with a written review", check: "photo", required: true, due_in_days: 109, applies_to: "both" },
        ],
      },
    ],
    routines: [],
    readings: [
      { key: "cases_simple", label: "Simple cases", outcome: false },
      { key: "cases_complex", label: "Complex cases", outcome: false },
      { key: "drive_applied", label: "Applications made in the drive", per: "scheme", outcome: false },
      { key: "drive_received", label: "Entitlements received in the drive", per: "scheme", outcome: true },
    ],
    lists: {},
    dimensions: { scheme: SCHEMES },
  },
};
