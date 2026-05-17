/**
 * Seeds Layer 2 facility indicators + activity bindings for all `-existing`
 * (recurring health-check) goal templates.
 *
 * Style: 4-6 state indicators per template, all RP_ACTIVITY captureSource,
 * each bound to the specific checklist item where it is naturally observed.
 *
 * Skip rules:
 *  - "did the task get done" items (visit attendance, register updated)
 *  - process / meta items (issue tracker active, MIS reporting active)
 *  - one-time setup items
 *
 * Idempotent: indicators are upserted by `key`; bindings by
 * (defId, templateSlug, checklistKey). Re-running is safe.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/seed-layer2-indicators-existing.ts            # dry run
 *   npx tsx scripts/seed-layer2-indicators-existing.ts --apply    # write
 */

import { randomUUID } from "crypto";
import prisma from "../lib/prisma";

type TargetFormula =
  | { type: "fixed"; value: number }
  | { type: "settlement_field"; field: string; multiplier: number }
  | { type: "facility_count"; multiplier: number }
  | { type: "scheme_baseline"; multiplier: number };

type Binding = { templateSlug: string; checklistKey: string };

type IndicatorSpec = {
  key: string;
  label: string;
  description?: string;
  domain: string;
  unit: string | null;
  frequency: "Daily" | "Weekly" | "Monthly" | "Quarterly";
  color: string;
  target?: TargetFormula;
  bindings: Binding[];
};

const COLOR = {
  Creche: "#ec4899",
  ChildrenCentre: "#8b5cf6",
  CommunityToilet: "#f43f5e",
  ElderlyCentre: "#0ea5e9",
  ElderlyKitchen: "#f59e0b",
  WaterATM: "#06b6d4",
  YouthResourceCentre: "#10b981",
};

const SPECS: IndicatorSpec[] = [
  // ── Creche programme (existing) ───────────────────────────────────────────
  {
    key: "creche_enrollment_count",
    label: "Creche enrollment",
    description: "Children enrolled in the creche this month, from the attendance register.",
    domain: "Creche", unit: "children", frequency: "Monthly", color: COLOR.Creche,
    bindings: [{ templateSlug: "creche-program-existing", checklistKey: "attendance-register-and-child-card-records-reviewed" }],
  },
  {
    key: "creche_avg_attendance_pct",
    label: "Creche avg daily attendance",
    description: "Average daily attendance as % of enrolled.",
    domain: "Creche", unit: "%", frequency: "Monthly", color: COLOR.Creche,
    target: { type: "fixed", value: 75 },
    bindings: [{ templateSlug: "creche-program-existing", checklistKey: "attendance-register-and-child-card-records-reviewed" }],
  },
  {
    key: "creche_hygiene_score",
    label: "Creche hygiene & safety score",
    description: "Score on 24-point hygiene checklist (max 24).",
    domain: "Creche", unit: "/24", frequency: "Monthly", color: COLOR.Creche,
    target: { type: "fixed", value: 24 },
    bindings: [{ templateSlug: "creche-program-existing", checklistKey: "hygiene-and-safety-standards-checked-against-24-point-checklist" }],
  },
  {
    key: "creche_growth_monitoring_pct",
    label: "Creche growth monitoring coverage",
    description: "% of enrolled children with current weight/height record.",
    domain: "Creche", unit: "%", frequency: "Monthly", color: COLOR.Creche,
    target: { type: "fixed", value: 100 },
    bindings: [{ templateSlug: "creche-program-existing", checklistKey: "growth-monitoring-data-spot-checked-weight-height-records-up-to-date" }],
  },
  {
    key: "creche_ifa_compliance_pct",
    label: "Creche IFA supplementation compliance",
    description: "% of eligible children receiving IFA on schedule.",
    domain: "Creche", unit: "%", frequency: "Monthly", color: COLOR.Creche,
    target: { type: "fixed", value: 100 },
    bindings: [{ templateSlug: "creche-program-existing", checklistKey: "ifa-supplementation-tracking-verified" }],
  },
  {
    key: "creche_issues_flagged",
    label: "Creche issues flagged this round",
    description: "Count of issues raised to supervisor.",
    domain: "Creche", unit: "count", frequency: "Monthly", color: COLOR.Creche,
    bindings: [{ templateSlug: "creche-program-existing", checklistKey: "issues-flagged-to-supervisor-immediately" }],
  },

  // ── Children Learning Centre (existing) ───────────────────────────────────
  {
    key: "clc_attendance_count",
    label: "CLC children attending",
    description: "Children present at the centre on a given visit (twice-weekly capture).",
    domain: "ChildrenCentre", unit: "children", frequency: "Weekly", color: COLOR.ChildrenCentre,
    bindings: [
      { templateSlug: "children-learning-centre-existing", checklistKey: "visit-1-attendance-register-reviewed" },
      { templateSlug: "children-learning-centre-existing", checklistKey: "visit-2-this-week-same-checks-repeated" },
    ],
  },
  {
    key: "clc_learning_quality_score",
    label: "CLC learning quality score",
    description: "Spot-check score for learning activity quality (0-10).",
    domain: "ChildrenCentre", unit: "/10", frequency: "Weekly", color: COLOR.ChildrenCentre,
    target: { type: "fixed", value: 8 },
    bindings: [{ templateSlug: "children-learning-centre-existing", checklistKey: "visit-1-learning-quality-spot-check-done" }],
  },
  {
    key: "clc_open_infra_needs",
    label: "CLC open infrastructure / material needs",
    description: "Count of unresolved infrastructure or material flags.",
    domain: "ChildrenCentre", unit: "count", frequency: "Weekly", color: COLOR.ChildrenCentre,
    bindings: [{ templateSlug: "children-learning-centre-existing", checklistKey: "visit-1-infrastructure-material-needs-flagged" }],
  },
  {
    key: "clc_oosc_count",
    label: "Out-of-school children pending follow-up",
    description: "Children on the out-of-school list awaiting dropout follow-up.",
    domain: "ChildrenCentre", unit: "children", frequency: "Monthly", color: COLOR.ChildrenCentre,
    bindings: [{ templateSlug: "children-learning-centre-existing", checklistKey: "out-of-school-children-list-updated" }],
  },

  // ── Community Sanitation Complex (existing) ───────────────────────────────
  {
    key: "ct_cleanliness_score",
    label: "Community toilet cleanliness score",
    description: "Independent monthly cleanliness audit score (out of 100).",
    domain: "CommunityToilet", unit: "/100", frequency: "Monthly", color: COLOR.CommunityToilet,
    target: { type: "fixed", value: 90 },
    bindings: [{ templateSlug: "community-toilet-existing", checklistKey: "independent-community-cleanliness-audit-by-cmc-member-shg-rep-using-standardised" }],
  },
  {
    key: "ct_revenue_footfall_divergence_pct",
    label: "Revenue vs footfall divergence",
    description: "Absolute % divergence between collected revenue and expected from footfall. >10% triggers cash audit.",
    domain: "CommunityToilet", unit: "%", frequency: "Monthly", color: COLOR.CommunityToilet,
    target: { type: "fixed", value: 10 },
    bindings: [{ templateSlug: "community-toilet-existing", checklistKey: "revenue-vs-footfall-reconciliation-daily-revenue-from-all-sources-matched-agains" }],
  },
  {
    key: "ct_monthly_footfall",
    label: "Community toilet footfall",
    description: "Monthly footfall count.",
    domain: "CommunityToilet", unit: "uses", frequency: "Monthly", color: COLOR.CommunityToilet,
    bindings: [{ templateSlug: "community-toilet-existing", checklistKey: "revenue-vs-footfall-reconciliation-daily-revenue-from-all-sources-matched-agains" }],
  },
  {
    key: "ct_active_passes",
    label: "Active monthly passes",
    description: "Households with an active monthly pass.",
    domain: "CommunityToilet", unit: "households", frequency: "Monthly", color: COLOR.CommunityToilet,
    bindings: [{ templateSlug: "community-toilet-existing", checklistKey: "pass-renewal-drive-chase-households-whose-monthly-passes-lapsed-field-follow-up-" }],
  },
  {
    key: "ct_solar_kwh",
    label: "Community toilet solar kWh",
    description: "Monthly kWh generated by rooftop solar. >20% drop signals a fault.",
    domain: "CommunityToilet", unit: "kWh", frequency: "Quarterly", color: COLOR.CommunityToilet,
    bindings: [{ templateSlug: "community-toilet-existing", checklistKey: "solar-pv-output-check-monthly-kwh-trend-20-drop-signals-soiling-shading-or-inver" }],
  },

  // ── Elderly Care Centre (existing) ────────────────────────────────────────
  {
    key: "ec_home_visits_count",
    label: "Elderly home visits this month",
    description: "Home visits to elderly beneficiaries this month.",
    domain: "ElderlyCentre", unit: "visits", frequency: "Monthly", color: COLOR.ElderlyCentre,
    bindings: [{ templateSlug: "elderly-centre-existing", checklistKey: "home-visits-active" }],
  },
  {
    key: "ec_referrals_made",
    label: "Elderly referrals made",
    description: "Referrals to health / scheme / family services this month.",
    domain: "ElderlyCentre", unit: "referrals", frequency: "Monthly", color: COLOR.ElderlyCentre,
    bindings: [{ templateSlug: "elderly-centre-existing", checklistKey: "referral-systems-active" }],
  },
  {
    key: "ec_open_issues",
    label: "Elderly programme open issues",
    description: "Open items on the cluster issue tracker.",
    domain: "ElderlyCentre", unit: "count", frequency: "Monthly", color: COLOR.ElderlyCentre,
    bindings: [{ templateSlug: "elderly-centre-existing", checklistKey: "issue-tracker-active" }],
  },
  {
    key: "ec_corrective_action_pct",
    label: "Corrective actions closed",
    description: "% of prior-month corrective actions closed by end of this month.",
    domain: "ElderlyCentre", unit: "%", frequency: "Monthly", color: COLOR.ElderlyCentre,
    target: { type: "fixed", value: 100 },
    bindings: [{ templateSlug: "elderly-centre-existing", checklistKey: "corrective-actions-followed-up" }],
  },

  // ── Elderly Community Kitchen (existing) ──────────────────────────────────
  {
    key: "ek_meals_served",
    label: "Elderly kitchen meals served",
    description: "Total meals served in the month across kitchens (from CO daily logs).",
    domain: "ElderlyKitchen", unit: "meals", frequency: "Monthly", color: COLOR.ElderlyKitchen,
    bindings: [{ templateSlug: "elderly-kitchen-existing", checklistKey: "co-daily-visit-log-reviewed-for-all-kitchens" }],
  },
  {
    key: "ek_food_quality_score",
    label: "Elderly kitchen food quality",
    description: "Random food quality spot-check score (0-10).",
    domain: "ElderlyKitchen", unit: "/10", frequency: "Monthly", color: COLOR.ElderlyKitchen,
    target: { type: "fixed", value: 8 },
    bindings: [{ templateSlug: "elderly-kitchen-existing", checklistKey: "random-food-quality-check-conducted-taste-quantity-hygiene" }],
  },
  {
    key: "ek_satisfaction_pct",
    label: "Elderly satisfaction %",
    description: "% of enrolled elderly reporting food quality satisfaction.",
    domain: "ElderlyKitchen", unit: "%", frequency: "Monthly", color: COLOR.ElderlyKitchen,
    target: { type: "fixed", value: 80 },
    bindings: [{ templateSlug: "elderly-kitchen-existing", checklistKey: "feedback-collected-from-enrolled-elderly-on-food-quality-and-satisfaction" }],
  },
  {
    key: "ek_pension_coverage_pct",
    label: "Elderly pension coverage",
    description: "% of enrolled elderly verified to be receiving pension.",
    domain: "ElderlyKitchen", unit: "%", frequency: "Monthly", color: COLOR.ElderlyKitchen,
    target: { type: "fixed", value: 100 },
    bindings: [{ templateSlug: "elderly-kitchen-existing", checklistKey: "verify-all-enrolled-elderly-are-receiving-elderly-pension" }],
  },
  {
    key: "ek_inventory_variance_pct",
    label: "Kitchen inventory variance",
    description: "Absolute variance % between stock and usage records.",
    domain: "ElderlyKitchen", unit: "%", frequency: "Monthly", color: COLOR.ElderlyKitchen,
    target: { type: "fixed", value: 5 },
    bindings: [{ templateSlug: "elderly-kitchen-existing", checklistKey: "inventory-register-checked-stock-matched-against-usage" }],
  },
  {
    key: "ek_leakage_incidents",
    label: "Kitchen leakage / diversion incidents",
    description: "Confirmed leakage, overpayment, diversion or missing-stock incidents this month.",
    domain: "ElderlyKitchen", unit: "count", frequency: "Monthly", color: COLOR.ElderlyKitchen,
    bindings: [{ templateSlug: "elderly-kitchen-existing", checklistKey: "check-for-leakage-overpayment-diversion-or-missing-stock" }],
  },

  // ── Water ATM / RO Plant (existing) ───────────────────────────────────────
  {
    key: "wa_tds_mg_l",
    label: "Product water TDS",
    description: "Product TDS at month-end. Target band: 100–200 mg/L.",
    domain: "WaterATM", unit: "mg/L", frequency: "Monthly", color: COLOR.WaterATM,
    bindings: [{ templateSlug: "water-atm-existing", checklistKey: "product-tds-checked-and-logged-target-100-200-mg-l" }],
  },
  {
    key: "wa_microbial_pass",
    label: "Microbial test pass (1/0)",
    description: "1 if monthly E. coli microbial test passes, 0 if fails.",
    domain: "WaterATM", unit: "0/1", frequency: "Monthly", color: COLOR.WaterATM,
    target: { type: "fixed", value: 1 },
    bindings: [{ templateSlug: "water-atm-existing", checklistKey: "ph-and-turbidity-checked-monthly-microbial-e-coli-lab-test-done" }],
  },
  {
    key: "wa_litres_dispensed",
    label: "Litres dispensed",
    description: "Total litres dispensed in the month.",
    domain: "WaterATM", unit: "litres", frequency: "Monthly", color: COLOR.WaterATM,
    bindings: [{ templateSlug: "water-atm-existing", checklistKey: "daily-litres-dispensed-vs-expected-volume-reconciled" }],
  },
  {
    key: "wa_revenue_flow_divergence_pct",
    label: "Water ATM revenue vs flow divergence",
    description: "Absolute % divergence between revenue collected and flow-meter readings.",
    domain: "WaterATM", unit: "%", frequency: "Monthly", color: COLOR.WaterATM,
    target: { type: "fixed", value: 5 },
    bindings: [{ templateSlug: "water-atm-existing", checklistKey: "revenue-vs-flow-meter-logs-cross-checked-divergence-theft-or-metering-fault" }],
  },
  {
    key: "wa_active_households",
    label: "Water ATM active households",
    description: "Households that recharged at least once this month.",
    domain: "WaterATM", unit: "households", frequency: "Monthly", color: COLOR.WaterATM,
    bindings: [{ templateSlug: "water-atm-existing", checklistKey: "card-recharge-frequency-per-household-reviewed-no-recharge-in-2-weeks-follow-up" }],
  },
  {
    key: "wa_uptime_pct",
    label: "Water ATM uptime",
    description: "% of operating hours plant was available. Target: >95%.",
    domain: "WaterATM", unit: "%", frequency: "Monthly", color: COLOR.WaterATM,
    target: { type: "fixed", value: 95 },
    bindings: [{ templateSlug: "water-atm-existing", checklistKey: "downtime-log-reviewed-target-95-uptime-mttr-4-hours-minor-24-hours-major" }],
  },
  {
    key: "wa_membrane_flux_drop_pct",
    label: "Membrane flux drop",
    description: "% drop in permeate flow vs baseline. >15% triggers chemical clean / replacement.",
    domain: "WaterATM", unit: "%", frequency: "Monthly", color: COLOR.WaterATM,
    bindings: [{ templateSlug: "water-atm-existing", checklistKey: "membrane-flux-monitored-15-drop-in-permeate-flow-triggers-chemical-clean-or-repl" }],
  },

  // ── Youth Resource Centre (existing) ──────────────────────────────────────
  {
    key: "yrc_youth_at_cap_review",
    label: "Youth attending CAP review",
    description: "Youth group members present at this Saturday's CAP review.",
    domain: "YouthResourceCentre", unit: "youth", frequency: "Weekly", color: COLOR.YouthResourceCentre,
    bindings: [{ templateSlug: "youth-resource-centre-existing", checklistKey: "youth-groups-met-for-cap-review" }],
  },
  {
    key: "yrc_cap_milestones_done",
    label: "CAP milestones completed this week",
    description: "Number of Community Action Plan milestones marked done at this review.",
    domain: "YouthResourceCentre", unit: "milestones", frequency: "Weekly", color: COLOR.YouthResourceCentre,
    bindings: [{ templateSlug: "youth-resource-centre-existing", checklistKey: "cap-milestones-status-updated" }],
  },
  {
    key: "yrc_open_blockers",
    label: "YRC open blockers",
    description: "Open blockers / issues on the youth programme log.",
    domain: "YouthResourceCentre", unit: "count", frequency: "Weekly", color: COLOR.YouthResourceCentre,
    bindings: [{ templateSlug: "youth-resource-centre-existing", checklistKey: "blockers-and-issues-logged" }],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`Layer 2 indicator seed — ${apply ? "APPLYING" : "DRY RUN"}`);
  console.log("");

  // Sanity: every binding's templateSlug + checklistKey must exist in DB
  const allBindings = SPECS.flatMap(s => s.bindings);
  const uniqTemplates = Array.from(new Set(allBindings.map(b => b.templateSlug)));
  type CheckRow = { slug: string; pitstops: any };
  const tplRows = await prisma.$queryRaw<CheckRow[]>`
    SELECT slug, pitstops FROM "GoalTemplateDef" WHERE slug = ANY(${uniqTemplates})
  `;
  const tplKeySets: Record<string, Set<string>> = {};
  for (const r of tplRows) {
    const keys = new Set<string>();
    for (const pt of (r.pitstops as any[])) for (const ci of (pt.checklist ?? [])) {
      if (ci.key) keys.add(ci.key);
    }
    tplKeySets[r.slug] = keys;
  }
  let bindingErrors = 0;
  for (const s of SPECS) {
    for (const b of s.bindings) {
      const keys = tplKeySets[b.templateSlug];
      if (!keys) { console.error(`✗ template not found: ${b.templateSlug} (indicator: ${s.key})`); bindingErrors++; continue; }
      if (!keys.has(b.checklistKey)) {
        console.error(`✗ checklistKey not found: ${b.templateSlug} → ${b.checklistKey} (indicator: ${s.key})`);
        bindingErrors++;
      }
    }
  }
  if (bindingErrors) {
    console.error(`\n${bindingErrors} binding error(s). Aborting.`);
    process.exit(1);
  }

  // Group by template for printing
  const byTpl: Record<string, IndicatorSpec[]> = {};
  for (const s of SPECS) for (const b of s.bindings) {
    (byTpl[b.templateSlug] ??= []).push(s);
  }

  let created = 0, updated = 0, bindingsCreated = 0;
  let sortOrder = 100;

  for (const slug of Object.keys(byTpl).sort()) {
    console.log(`── ${slug} ──`);
    const seen = new Set<string>();
    for (const spec of byTpl[slug]) {
      if (seen.has(spec.key)) continue;
      seen.add(spec.key);

      const target = spec.target ? describeTarget(spec.target) : "no target (trend)";
      const bindingsLines = spec.bindings.map(b => `        ↳ ${b.templateSlug} → ${b.checklistKey}`).join("\n");
      console.log(`  • ${spec.key.padEnd(40)} ${spec.label} · ${spec.unit ?? "-"} · ${target}`);
      console.log(bindingsLines);
    }
    console.log("");
  }

  if (!apply) {
    console.log(`\nDry run: ${SPECS.length} indicators across ${Object.keys(byTpl).length} templates, ` +
      `${allBindings.length} bindings. Re-run with --apply to write.`);
    await prisma.$disconnect();
    return;
  }

  for (const spec of SPECS) {
    // Upsert indicator def
    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "FacilityIndicatorDef" WHERE key = ${spec.key} LIMIT 1
    `;
    let defId: string;
    if (existing[0]) {
      defId = existing[0].id;
      await prisma.$executeRaw`
        UPDATE "FacilityIndicatorDef" SET
          label = ${spec.label},
          description = ${spec.description ?? null},
          domain = ${spec.domain},
          unit = ${spec.unit},
          frequency = ${spec.frequency}::"MetricFrequency",
          color = ${spec.color},
          "targetFormula" = ${spec.target ? JSON.stringify(spec.target) : null}::jsonb,
          "captureSource" = 'RP_ACTIVITY'::"FacilityIndicatorSource",
          "sortOrder" = ${sortOrder++},
          "updatedAt" = NOW()
        WHERE id = ${defId}
      `;
      updated++;
    } else {
      defId = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO "FacilityIndicatorDef" (
          id, key, label, description, domain, unit, frequency, color,
          "targetFormula", "captureSource", "staleYellowDays", "staleRedDays",
          "sortOrder", "isActive", "createdAt", "updatedAt"
        ) VALUES (
          ${defId}, ${spec.key}, ${spec.label}, ${spec.description ?? null}, ${spec.domain},
          ${spec.unit}, ${spec.frequency}::"MetricFrequency", ${spec.color},
          ${spec.target ? JSON.stringify(spec.target) : null}::jsonb,
          'RP_ACTIVITY'::"FacilityIndicatorSource", 45, 90,
          ${sortOrder++}, true, NOW(), NOW()
        )
      `;
      created++;
    }

    for (const b of spec.bindings) {
      const dup = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "ActivityIndicatorBinding"
        WHERE "defId" = ${defId} AND "templateSlug" = ${b.templateSlug} AND "checklistKey" = ${b.checklistKey}
        LIMIT 1
      `;
      if (dup[0]) continue;
      const bindingId = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO "ActivityIndicatorBinding" (id, "defId", "templateSlug", "checklistKey", "numericField", "createdAt")
        VALUES (${bindingId}, ${defId}, ${b.templateSlug}, ${b.checklistKey}, ${`binding_${bindingId.slice(0, 8)}`}, NOW())
      `;
      bindingsCreated++;
    }
  }

  console.log(`\nApplied: ${created} indicators created, ${updated} updated, ${bindingsCreated} bindings created.`);
  await prisma.$disconnect();
}

function describeTarget(t: TargetFormula): string {
  if (t.type === "fixed") return `target ${t.value}`;
  if (t.type === "settlement_field") return `target ${t.field} × ${t.multiplier}`;
  if (t.type === "facility_count") return `target facilities × ${t.multiplier}`;
  return `target scheme × ${t.multiplier}`;
}

main().catch(e => { console.error(e); process.exit(1); });
