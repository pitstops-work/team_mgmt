import prisma from "../lib/prisma";

async function main() {
  // ── 1. Needs domain ────────────────────────────────────────────────────────
  const existing = await prisma.needsFormulaConfig.findFirst({
    where: { domain: "FoodDistribution" },
  });

  if (!existing) {
    const max = await prisma.needsFormulaConfig.findFirst({
      orderBy: { sortOrder: "desc" },
    });
    await prisma.needsFormulaConfig.create({
      data: {
        domain: "FoodDistribution",
        label: "Food Distribution",
        color: "#f97316",
        domainType: "count",
        denominator: null,
        populationField: null,
        description: "City-level food distribution programme. Tracks active distribution points (DPs) against configured targets. Not settlement-based.",
        sortOrder: (max?.sortOrder ?? 0) + 1,
        isActive: true,
        assessmentLevel: "city",
        clusterScope: false,
      },
    });
    console.log("✓ FoodDistribution needs domain created");
  } else {
    console.log("– FoodDistribution needs domain already exists, skipping");
  }

  // ── 2. Template helper ─────────────────────────────────────────────────────
  async function upsertTemplate(
    slug: string,
    name: string,
    description: string,
    icon: string,
    sortOrder: number,
    pitstops: object[],
  ) {
    const row = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "GoalTemplateDef" WHERE slug = ${slug} LIMIT 1
    `;
    const pitstopsJson = JSON.stringify(pitstops);
    if (row.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO "GoalTemplateDef"
          (id, slug, name, description, category, icon, "needsDomain", parameters, pitstops, "isActive", "sortOrder", "createdAt", "updatedAt")
        VALUES
          (gen_random_uuid(), ${slug}, ${name}, ${description}, 'Food Programme', ${icon},
           'FoodDistribution', '[]'::jsonb, ${pitstopsJson}::jsonb, true, ${sortOrder}, NOW(), NOW())
      `;
      console.log(`✓ Template created: ${name}`);
    } else {
      await prisma.$executeRaw`
        UPDATE "GoalTemplateDef"
        SET name = ${name}, description = ${description}, pitstops = ${pitstopsJson}::jsonb, "updatedAt" = NOW()
        WHERE slug = ${slug}
      `;
      console.log(`↺ Template updated: ${name}`);
    }
  }

  // ── 3. Launch template ─────────────────────────────────────────────────────
  await upsertTemplate(
    "food-distribution-launch",
    "Food Distribution — Launch & Operationalisation",
    "One-time setup goal to get the food distribution programme operational. Covers vendor contract, transport, kit procurement, DP personnel recruitment and training, APSA confirmation, and dry run through to Day 1.",
    "🍱",
    100,
    [
      {
        title: "Vendor Contract & Kitchen Readiness",
        type: "Meeting",
        notes: "Formalise the Ramani Food contract and confirm kitchen is operationally ready before any distribution begins. Kitchen must be cleared for 04:30 AM daily readiness.",
        startSlaDays: 0,
        slaDays: 14,
        progressTag: "Permissions",
        checklist: [
          { text: "Ramani Food contract signed — price escalation clause included", completionType: "Upload" },
          { text: "SLA terms documented — delivery time, food quality standards, fallback protocol", completionType: "Upload" },
          { text: "FSSAI certificate verified and filed", completionType: "Upload" },
          { text: "04:30 AM kitchen readiness protocol agreed with Ramani team", activityTitle: "Kitchen Readiness Protocol Meeting", completionType: "Activity" },
          { text: "Kitchen visit completed — hygiene and safety audit done", activityTitle: "Kitchen Inspection Visit", completionType: "Activity" },
          { text: "GPS logging on vehicle confirmed active", completionType: "Upload" },
        ],
      },
      {
        title: "Transport & Contingency Setup",
        type: "Review",
        notes: "Confirm TATA Ace vehicle, train driver on FILO loading and timed route, and formalise JustDelivery as backup transport on a retainer. Backup must be contractual before Day 1.",
        startSlaDays: 0,
        slaDays: 21,
        progressTag: "Infrastructure",
        checklist: [
          { text: "TATA Ace vehicle inspected and cleared", activityTitle: "Vehicle Inspection", completionType: "Activity" },
          { text: "Driver confirmed and route-trained with timed dry run", activityTitle: "Driver Route Training Run", completionType: "Activity" },
          { text: "FILO loading protocol documented and tested with driver", completionType: "Upload" },
          { text: "Departure checklist laminated and fixed in vehicle cab", completionType: "Upload" },
          { text: "JustDelivery backup retainer signed and on file", activityTitle: "JustDelivery Retainer Meeting", completionType: "Upload" },
          { text: "Emergency handover protocol agreed — driver contacts JustDelivery directly if breakdown", completionType: "Upload" },
        ],
      },
      {
        title: "Kit Procurement & Assembly",
        type: "Review",
        notes: "Procure all kit components per the distribution kit specification. Number every item, affix QR codes, assemble one complete kit per DP, and test full vehicle bay loading before Day 1.",
        startSlaDays: 0,
        slaDays: 21,
        progressTag: "Infrastructure",
        checklist: [
          { text: "Insulated food containers procured — capacity 50–300 units, stainless steel inner lining", completionType: "Upload" },
          { text: "Foldable tables procured — 180×60 cm, one per DP", completionType: "Upload" },
          { text: "20L water cans procured — 2 per DP", completionType: "Upload" },
          { text: "Serving equipment procured — 400g bowls, spoons, paper plates, gloves, headcaps, cups", completionType: "Upload" },
          { text: "Branded umbrellas / standees procured — one per DP", completionType: "Upload" },
          { text: "Dustbin covers procured — 2 per DP", completionType: "Upload" },
          { text: "All kit items numbered and catalogued in master inventory sheet", completionType: "Upload" },
          { text: "QR codes printed and affixed to all containers and kit bags", completionType: "Upload" },
          { text: "Vehicle bay loading plan tested — both bays fully mapped", activityTitle: "Trial Vehicle Loading Test", completionType: "Activity" },
        ],
      },
      {
        title: "DP Personnel Recruitment",
        type: "Meeting",
        notes: "Identify and confirm one Distribution Point person per hotspot via Sampark/APSA community networks. DP 5 (shelter) is served directly by the driver — no separate personnel needed.",
        startSlaDays: 7,
        slaDays: 28,
        progressTag: "Team",
        checklist: [
          { text: "DP 1 personnel identified via Sampark/APSA network", completionType: "Voice" },
          { text: "DP 2 personnel identified", completionType: "Voice" },
          { text: "DP 3 personnel identified", completionType: "Voice" },
          { text: "DP 4 personnel identified", completionType: "Voice" },
          { text: "DP 5 (shelter) — driver serves directly, no separate DP personnel needed", completionType: "Voice" },
          { text: "All DP personnel agreements signed", completionType: "Upload" },
          { text: "WhatsApp group set up with all DP personnel and driver", activityTitle: "DP Personnel Identification Meeting with Sampark", completionType: "Activity" },
        ],
      },
      {
        title: "APSA Confirmation",
        type: "Meeting",
        notes: "APSA inclusion is tentative. Resolve within 30 days of grant start. If not confirmed, stress-test viability as a Sampark-only 5-DP operation and adjust unit economics accordingly.",
        startSlaDays: 0,
        slaDays: 30,
        progressTag: "Permissions",
        checklist: [
          { text: "APSA briefed on programme model and their role", activityTitle: "APSA Coordination Meeting", completionType: "Activity" },
          { text: "APSA confirmation received — or Sampark-only fallback plan activated", activityTitle: "APSA Decision Meeting", completionType: "Activity" },
          { text: "DP allocation finalised between Sampark and APSA", completionType: "Upload" },
          { text: "If APSA not onboarded — unit economics stress-tested at 5 DPs only and shared with Foundation", completionType: "Upload" },
        ],
      },
      {
        title: "DP Personnel Training",
        type: "Training",
        notes: "Train all DP personnel together in one session. Cover queue management, hygiene, kit setup/teardown, the 45–60 minute service window, and daily reporting. Follow with a mock setup at each hotspot.",
        startSlaDays: 21,
        slaDays: 42,
        progressTag: "Training",
        checklist: [
          { text: "Queue management protocol trained — fixed unit cap, queue lines communicated", activityTitle: "DP Personnel Training Session", completionType: "Activity" },
          { text: "Hygiene protocol trained — gloves, headcaps, serving discipline", completionType: "Voice" },
          { text: "Kit setup and teardown trained — table, umbrella, containers, water cans", completionType: "Voice" },
          { text: "45–60 minute service window protocol drilled", completionType: "Voice" },
          { text: "Daily reporting trained — how to log losses, damage, crowd incidents", completionType: "Voice" },
          { text: "Mock setup done at each hotspot location", activityTitle: "Mock Setup Visits at Hotspots", completionType: "Activity" },
        ],
      },
      {
        title: "Dry Run & Programme Launch",
        type: "SiteVisit",
        notes: "Full end-to-end dry run 3 days before launch. Kitchen departure → all 5 DPs → return. Time every leg. Resolve all issues before Day 1. Log launch formally.",
        startSlaDays: 42,
        slaDays: 56,
        progressTag: "Live",
        checklist: [
          { text: "Full dry run completed — kitchen to all 5 DPs and back", activityTitle: "Full Dry Run", completionType: "Activity" },
          { text: "DP 1 reached by 05:30 AM ✓", completionType: "Voice" },
          { text: "DP 5 (shelter) reached by 06:30 AM ✓", completionType: "Voice" },
          { text: "Return route completed by 10:00 AM ✓", completionType: "Voice" },
          { text: "Kitchen return and unload done by 10:15 AM ✓", completionType: "Voice" },
          { text: "QR tracking tested end-to-end — all kits scanned in and out", completionType: "Voice" },
          { text: "Issues from dry run logged and resolved", activityTitle: "Post Dry-Run Debrief", completionType: "Activity" },
          { text: "Foundation leadership informed of confirmed launch date", completionType: "Voice" },
          { text: "Day 1 — first live distribution completed", activityTitle: "Day 1 — First Live Distribution", completionType: "Activity" },
        ],
      },
    ],
  );

  // ── 4. Monthly operations template ─────────────────────────────────────────
  await upsertTemplate(
    "food-distribution-monthly",
    "Food Distribution — Monthly Operations Review",
    "Recurring monthly goal covering units & DP coverage, Ramani Food SLA review, kit & vehicle audit, DP personnel check-in, and MIS/grant reporting.",
    "🍱",
    101,
    [
      {
        title: "Units & DP Coverage Review",
        type: "Review",
        notes: "Collect total units distributed per DP this month. Identify under-served DPs and document reason. Review wastage/leftover data. Flag month-on-month trends.",
        startSlaDays: 0,
        slaDays: 30,
        recurrence: "Monthly",
        repeatCount: 12,
        progressTag: "Monitoring",
        checklist: [
          { text: "Units distributed per DP collected for the month", activityTitle: "Monthly DP Data Collection", completionType: "Activity" },
          { text: "Under-served DPs identified and reason documented", completionType: "Voice" },
          { text: "Wastage/leftover data reviewed per DP", completionType: "Voice" },
          { text: "Month-on-month trend noted and shared with team", completionType: "Upload" },
        ],
      },
      {
        title: "Vendor Review — Ramani Food",
        type: "Meeting",
        notes: "Monthly SLA review with Ramani Food. Check production volume against daily target. Log late departures, quality complaints, or SLA breaches. Confirm next month's volume.",
        startSlaDays: 0,
        slaDays: 30,
        recurrence: "Monthly",
        repeatCount: 12,
        progressTag: "Monitoring",
        checklist: [
          { text: "Production volume confirmed against daily units target", activityTitle: "Monthly Review Meeting with Ramani Food", completionType: "Activity" },
          { text: "Late departures logged — any day kitchen not ready by 04:30 AM", completionType: "Voice" },
          { text: "Food quality complaints reviewed", completionType: "Voice" },
          { text: "SLA compliance assessed — escalation raised if breach", completionType: "Voice" },
          { text: "Next month's volume confirmed with Ramani", completionType: "Voice" },
        ],
      },
      {
        title: "Kit & Vehicle Audit",
        type: "Review",
        notes: "Monthly physical audit of all kit items against master inventory. Reconcile QR tracking data. Document losses or damage. Check vehicle service schedule.",
        startSlaDays: 0,
        slaDays: 30,
        recurrence: "Monthly",
        repeatCount: 12,
        progressTag: "Monitoring",
        checklist: [
          { text: "Full kit inventory count done — reconciled against master list", activityTitle: "Monthly Kit Audit", completionType: "Activity" },
          { text: "Damaged items documented — replacement ordered", completionType: "Upload" },
          { text: "Lost items documented — QR tracking reconciled", completionType: "Upload" },
          { text: "Insulated containers checked — temperature retention adequate", completionType: "Upload" },
          { text: "Vehicle service due date checked — service booked if needed", completionType: "Upload" },
        ],
      },
      {
        title: "DP Personnel Check-In",
        type: "Meeting",
        notes: "Monthly check-in with all DP personnel. Confirm everyone is still active. Collect feedback on crowd patterns, kit issues, timing. Flag replacements needed.",
        startSlaDays: 0,
        slaDays: 30,
        recurrence: "Monthly",
        repeatCount: 12,
        progressTag: "Monitoring",
        checklist: [
          { text: "All DP personnel contacted and confirmed active", activityTitle: "Monthly DP Personnel Check-In", completionType: "Activity" },
          { text: "Replacements needed — identified and training scheduled", completionType: "Voice" },
          { text: "DP personnel feedback collected — crowd, kit, timing issues", completionType: "Voice" },
          { text: "Sampark coordination reviewed — community issues flagged", completionType: "Voice" },
        ],
      },
      {
        title: "MIS & Grant Reporting",
        type: "Review",
        notes: "Compile monthly MIS. Units served, DPs operational, kit status, cost per unit. Update grant utilisation tracker. Share with Foundation.",
        startSlaDays: 25,
        slaDays: 30,
        recurrence: "Monthly",
        repeatCount: 12,
        progressTag: "Monitoring",
        checklist: [
          { text: "Monthly MIS compiled — units served, DPs operational, kit status, cost per unit", activityTitle: "Monthly Reporting Session", completionType: "Activity" },
          { text: "Grant utilisation updated", completionType: "Upload" },
          { text: "Report shared with Foundation", completionType: "Upload" },
        ],
      },
    ],
  );

  // ── 5. New DP template ─────────────────────────────────────────────────────
  await upsertTemplate(
    "food-distribution-new-dp",
    "Food Distribution — New DP Activation",
    "Use when adding any new distribution point. Covers hotspot assessment, DP personnel identification and training, route integration, and first live distribution sign-off.",
    "📍",
    102,
    [
      {
        title: "Hotspot Assessment",
        type: "SiteVisit",
        notes: "Visit and assess the proposed hotspot before committing. Confirm vehicle access, beneficiary population, serving time window, and no overlap with existing DPs.",
        startSlaDays: 0,
        slaDays: 7,
        progressTag: "Baseline",
        checklist: [
          { text: "Location visited — beneficiary population estimated", activityTitle: "Hotspot Field Visit", completionType: "Activity" },
          { text: "Hotspot type confirmed — bus stand / railway / naka / shelter / hospital / other", completionType: "Voice" },
          { text: "TATA Ace access and parking confirmed — route driveable from existing stops", completionType: "Voice" },
          { text: "Optimal serving time window assessed for this location", completionType: "Voice" },
          { text: "Overlap with existing DPs checked — no cannibalisation", completionType: "Voice" },
          { text: "Community / local authority informed of plans", completionType: "Voice" },
        ],
      },
      {
        title: "DP Personnel Identification & Agreement",
        type: "Meeting",
        notes: "Find a DP person via Sampark/APSA community networks. Brief them fully on the role — timing, kit handling, hygiene, daily reporting. Get a signed agreement.",
        startSlaDays: 7,
        slaDays: 21,
        progressTag: "Team",
        checklist: [
          { text: "DP personnel candidate identified via Sampark/APSA network", completionType: "Voice" },
          { text: "Candidate briefed on role — timing, kit, hygiene, reporting", activityTitle: "DP Personnel Briefing Meeting", completionType: "Activity" },
          { text: "Agreement signed", completionType: "Upload" },
          { text: "Emergency contact and backup person identified", completionType: "Voice" },
        ],
      },
      {
        title: "DP Personnel Training",
        type: "Training",
        notes: "Train the new DP person at the actual hotspot. Cover all protocols and do a mock setup with the full kit before the first live distribution.",
        startSlaDays: 21,
        slaDays: 35,
        progressTag: "Training",
        checklist: [
          { text: "Queue management protocol trained", activityTitle: "DP Training Session at Hotspot", completionType: "Activity" },
          { text: "Hygiene protocol trained", completionType: "Voice" },
          { text: "Kit setup and teardown trained — full mock with actual kit", activityTitle: "Mock Setup at Hotspot", completionType: "Activity" },
          { text: "Daily reporting and loss documentation trained", completionType: "Voice" },
        ],
      },
      {
        title: "Route Integration",
        type: "Review",
        notes: "Insert the new DP into the route sequence. Recalculate timing across all stops to confirm everyone is still served within the window. Brief driver and update vehicle bay plan.",
        startSlaDays: 28,
        slaDays: 42,
        progressTag: "Infrastructure",
        checklist: [
          { text: "New DP inserted into route sequence — FILO loading order updated", completionType: "Upload" },
          { text: "End-to-end timing recalculated — all DPs still within window", completionType: "Upload" },
          { text: "Driver briefed on new stop", activityTitle: "Route Update Meeting with Driver", completionType: "Activity" },
          { text: "Kit assembled and numbered for new DP", completionType: "Upload" },
          { text: "Vehicle bay layout updated — new kit confirmed to fit", completionType: "Upload" },
        ],
      },
      {
        title: "First Distribution & Sign-Off",
        type: "SiteVisit",
        notes: "Observe the first live distribution at the new DP. Record units served, log issues, debrief the DP person. Mark active in programme tracker once stable.",
        startSlaDays: 42,
        slaDays: 49,
        progressTag: "Live",
        checklist: [
          { text: "First distribution day completed", activityTitle: "Day 1 Observation at New DP", completionType: "Activity" },
          { text: "Units served on Day 1 recorded", completionType: "Upload" },
          { text: "Issues on Day 1 logged and resolved", completionType: "Voice" },
          { text: "DP personnel debrief done", activityTitle: "Post Day-1 Debrief with DP Person", completionType: "Activity" },
          { text: "DP marked active in programme tracker", completionType: "Upload" },
        ],
      },
    ],
  );

  // ── 6. Fix completionType on already-created checklist items ──────────────
  // Update items inside existing FoodDistribution goals that still have default Activity type
  // but should be Voice or Upload. Keyed on exact text match within food domain goals.

  type FixRule = { text: string; type: "Upload" | "Voice" };
  const uploadFixes: FixRule[] = [
    { text: "Insulated food containers procured — capacity 50–300 units, stainless steel inner lining", type: "Upload" },
    { text: "Foldable tables procured — 180×60 cm, one per DP", type: "Upload" },
    { text: "20L water cans procured — 2 per DP", type: "Upload" },
    { text: "Serving equipment procured — 400g bowls, spoons, paper plates, gloves, headcaps, cups", type: "Upload" },
    { text: "Branded umbrellas / standees procured — one per DP", type: "Upload" },
    { text: "Dustbin covers procured — 2 per DP", type: "Upload" },
    { text: "Month-on-month trend noted and shared with team", type: "Upload" },
    { text: "Grant utilisation updated", type: "Upload" },
    { text: "Report shared with Foundation", type: "Upload" },
    { text: "Units served on Day 1 recorded", type: "Upload" },
    { text: "DP marked active in programme tracker", type: "Upload" },
  ];
  const voiceFixes: FixRule[] = [
    { text: "Hygiene protocol trained — gloves, headcaps, serving discipline", type: "Voice" },
    { text: "Kit setup and teardown trained — table, umbrella, containers, water cans", type: "Voice" },
    { text: "45–60 minute service window protocol drilled", type: "Voice" },
    { text: "DP 1 reached by 05:30 AM ✓", type: "Voice" },
    { text: "DP 5 (shelter) reached by 06:30 AM ✓", type: "Voice" },
    { text: "Return route completed by 10:00 AM ✓", type: "Voice" },
    { text: "Kitchen return and unload done by 10:15 AM ✓", type: "Voice" },
    { text: "QR tracking tested end-to-end — all kits scanned in and out", type: "Voice" },
    { text: "Hygiene protocol trained", type: "Voice" },
    { text: "DP 1 personnel identified via Sampark/APSA network", type: "Voice" },
    { text: "DP 2 personnel identified", type: "Voice" },
    { text: "DP 3 personnel identified", type: "Voice" },
    { text: "DP 4 personnel identified", type: "Voice" },
    { text: "DP 5 (shelter) — driver serves directly, no separate DP personnel needed", type: "Voice" },
    { text: "Foundation leadership informed of confirmed launch date", type: "Voice" },
    { text: "Wastage/leftover data reviewed per DP", type: "Voice" },
    { text: "Late departures logged — any day kitchen not ready by 04:30 AM", type: "Voice" },
    { text: "Food quality complaints reviewed", type: "Voice" },
    { text: "SLA compliance assessed — escalation raised if breach", type: "Voice" },
    { text: "Next month's volume confirmed with Ramani", type: "Voice" },
    { text: "DP personnel feedback collected — crowd, kit, timing issues", type: "Voice" },
    { text: "Sampark coordination reviewed — community issues flagged", type: "Voice" },
    { text: "Hotspot type confirmed — bus stand / railway / naka / shelter / hospital / other", type: "Voice" },
    { text: "TATA Ace access and parking confirmed — route driveable from existing stops", type: "Voice" },
    { text: "Optimal serving time window assessed for this location", type: "Voice" },
    { text: "Overlap with existing DPs checked — no cannibalisation", type: "Voice" },
    { text: "Community / local authority informed of plans", type: "Voice" },
    { text: "DP personnel candidate identified via Sampark/APSA network", type: "Voice" },
    { text: "Emergency contact and backup person identified", type: "Voice" },
  ];

  let fixCount = 0;
  for (const fix of [...uploadFixes, ...voiceFixes]) {
    const result = await prisma.$executeRaw`
      UPDATE "ChecklistItem" ci
      SET "completionType" = ${fix.type}::"ChecklistCompletionType"
      FROM "Pitstop" p
      JOIN "Goal" g ON g.id = p."goalId"
      WHERE ci."pitstopId" = p.id
        AND g."needsDomain" = 'FoodDistribution'
        AND g."deletedAt" IS NULL
        AND p."deletedAt" IS NULL
        AND ci.text = ${fix.text}
        AND ci."completionType" = 'Activity'::"ChecklistCompletionType"
    `;
    fixCount += Number(result);
  }
  console.log(`✓ Fixed completionType on ${fixCount} existing checklist items`);

  console.log("\n✅ All done.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
