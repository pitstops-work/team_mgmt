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

  // Helper: activity shorthand
  const act  = (title: string) => ({ title, completionType: "Activity" });
  const voice = (title: string) => ({ title, completionType: "Voice" });
  const upload = (title: string) => ({ title, completionType: "Upload" });

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
          { text: "Ramani Food contract signed — price escalation clause included",               activities: [upload("Sign and Upload Ramani Food Contract")] },
          { text: "SLA terms documented — delivery time, food quality standards, fallback protocol", activities: [upload("Document and Upload SLA Terms")] },
          { text: "FSSAI certificate verified and filed",                                          activities: [upload("Upload FSSAI Certificate")] },
          { text: "04:30 AM kitchen readiness protocol agreed with Ramani team",                   activities: [act("Kitchen Readiness Protocol Meeting")] },
          { text: "Kitchen visit completed — hygiene and safety audit done",                       activities: [act("Kitchen Inspection Visit")] },
          { text: "GPS logging on vehicle confirmed active",                                       activities: [upload("Upload GPS Logging Confirmation")] },
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
          { text: "TATA Ace vehicle inspected and cleared",                                        activities: [act("Vehicle Inspection")] },
          { text: "Driver confirmed and route-trained with timed dry run",                         activities: [act("Driver Route Training Run")] },
          { text: "FILO loading protocol documented and tested with driver",                       activities: [upload("Document and Upload FILO Loading Protocol")] },
          { text: "Departure checklist laminated and fixed in vehicle cab",                        activities: [upload("Prepare and Upload Departure Checklist")] },
          { text: "JustDelivery backup retainer signed and on file",                               activities: [act("JustDelivery Retainer Meeting")] },
          { text: "Emergency handover protocol agreed — driver contacts JustDelivery directly if breakdown", activities: [upload("Upload Emergency Handover Protocol")] },
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
          { text: "Insulated food containers procured — capacity 50–300 units, stainless steel inner lining", activities: [upload("Procure Insulated Food Containers")] },
          { text: "Foldable tables procured — 180×60 cm, one per DP",                             activities: [upload("Procure Foldable Tables")] },
          { text: "20L water cans procured — 2 per DP",                                           activities: [upload("Procure 20L Water Cans")] },
          { text: "Serving equipment procured — 400g bowls, spoons, paper plates, gloves, headcaps, cups", activities: [upload("Procure Serving Equipment")] },
          { text: "Branded umbrellas / standees procured — one per DP",                           activities: [upload("Procure Branded Umbrellas and Standees")] },
          { text: "Dustbin covers procured — 2 per DP",                                           activities: [upload("Procure Dustbin Covers")] },
          { text: "All kit items numbered and catalogued in master inventory sheet",               activities: [upload("Catalogue and Number Kit Items")] },
          { text: "QR codes printed and affixed to all containers and kit bags",                   activities: [upload("Print and Affix QR Codes")] },
          { text: "Vehicle bay loading plan tested — both bays fully mapped",                      activities: [act("Trial Vehicle Loading Test")] },
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
          { text: "DP 1 personnel identified via Sampark/APSA network",                           activities: [voice("Identify and Confirm DP 1 Personnel")] },
          { text: "DP 2 personnel identified",                                                    activities: [voice("Identify and Confirm DP 2 Personnel")] },
          { text: "DP 3 personnel identified",                                                    activities: [voice("Identify and Confirm DP 3 Personnel")] },
          { text: "DP 4 personnel identified",                                                    activities: [voice("Identify and Confirm DP 4 Personnel")] },
          { text: "DP 5 (shelter) — driver serves directly, no separate DP personnel needed",     activities: [voice("Confirm DP 5 Shelter Driver Arrangement")] },
          { text: "All DP personnel agreements signed",                                           activities: [upload("Upload Signed DP Personnel Agreements")] },
          { text: "WhatsApp group set up with all DP personnel and driver",                       activities: [act("DP Personnel Identification Meeting with Sampark")] },
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
          { text: "APSA briefed on programme model and their role",                               activities: [act("APSA Coordination Meeting")] },
          { text: "APSA confirmation received — or Sampark-only fallback plan activated",         activities: [act("APSA Decision Meeting")] },
          { text: "DP allocation finalised between Sampark and APSA",                             activities: [upload("Upload DP Allocation Plan")] },
          { text: "If APSA not onboarded — unit economics stress-tested at 5 DPs only and shared with Foundation", activities: [upload("Upload Sampark-Only Fallback Plan")] },
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
          { text: "Queue management protocol trained — fixed unit cap, queue lines communicated", activities: [act("DP Personnel Training Session")] },
          { text: "Hygiene protocol trained — gloves, headcaps, serving discipline",              activities: [voice("Confirm Hygiene Protocol Training")] },
          { text: "Kit setup and teardown trained — table, umbrella, containers, water cans",     activities: [voice("Confirm Kit Setup and Teardown Training")] },
          { text: "45–60 minute service window protocol drilled",                                 activities: [voice("Confirm Service Window Protocol Drilled")] },
          { text: "Daily reporting trained — how to log losses, damage, crowd incidents",         activities: [voice("Confirm Daily Reporting Training")] },
          { text: "Mock setup done at each hotspot location",                                     activities: [act("Mock Setup Visits at Hotspots")] },
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
          { text: "Full dry run completed — kitchen to all 5 DPs and back",                      activities: [act("Full Dry Run")] },
          { text: "DP 1 reached by 05:30 AM ✓",                                                  activities: [voice("Log DP 1 Arrival Time")] },
          { text: "DP 5 (shelter) reached by 06:30 AM ✓",                                        activities: [voice("Log DP 5 Arrival Time")] },
          { text: "Return route completed by 10:00 AM ✓",                                        activities: [voice("Log Return Route Completion Time")] },
          { text: "Kitchen return and unload done by 10:15 AM ✓",                                activities: [voice("Log Kitchen Return and Unload Time")] },
          { text: "QR tracking tested end-to-end — all kits scanned in and out",                 activities: [voice("Log QR Tracking Test Results")] },
          { text: "Issues from dry run logged and resolved",                                      activities: [act("Post Dry-Run Debrief")] },
          { text: "Foundation leadership informed of confirmed launch date",                      activities: [voice("Inform Foundation of Confirmed Launch Date")] },
          { text: "Day 1 — first live distribution completed",                                   activities: [act("Day 1 — First Live Distribution")] },
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
          { text: "Units distributed per DP collected for the month",                             activities: [act("Monthly DP Data Collection")] },
          { text: "Under-served DPs identified and reason documented",                            activities: [voice("Log Under-Served DP Analysis")] },
          { text: "Wastage/leftover data reviewed per DP",                                        activities: [voice("Log Wastage Data Review")] },
          { text: "Month-on-month trend noted and shared with team",                              activities: [upload("Upload Monthly Trend Report")] },
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
          { text: "Production volume confirmed against daily units target",                       activities: [act("Monthly Review Meeting with Ramani Food")] },
          { text: "Late departures logged — any day kitchen not ready by 04:30 AM",               activities: [voice("Log Late Departure Incidents")] },
          { text: "Food quality complaints reviewed",                                             activities: [voice("Log Food Quality Complaints")] },
          { text: "SLA compliance assessed — escalation raised if breach",                        activities: [voice("Log SLA Compliance Assessment")] },
          { text: "Next month's volume confirmed with Ramani",                                    activities: [voice("Confirm Next Month Volume with Ramani")] },
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
          { text: "Full kit inventory count done — reconciled against master list",               activities: [act("Monthly Kit Audit")] },
          { text: "Damaged items documented — replacement ordered",                               activities: [upload("Upload Damaged Items Report")] },
          { text: "Lost items documented — QR tracking reconciled",                               activities: [upload("Upload Lost Items and QR Reconciliation")] },
          { text: "Insulated containers checked — temperature retention adequate",                 activities: [upload("Upload Container Condition Check")] },
          { text: "Vehicle service due date checked — service booked if needed",                  activities: [upload("Upload Vehicle Service Status")] },
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
          { text: "All DP personnel contacted and confirmed active",                              activities: [act("Monthly DP Personnel Check-In")] },
          { text: "Replacements needed — identified and training scheduled",                      activities: [voice("Log DP Replacement Needs")] },
          { text: "DP personnel feedback collected — crowd, kit, timing issues",                  activities: [voice("Log DP Feedback")] },
          { text: "Sampark coordination reviewed — community issues flagged",                     activities: [voice("Log Sampark Coordination Review")] },
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
          { text: "Monthly MIS compiled — units served, DPs operational, kit status, cost per unit", activities: [act("Monthly Reporting Session")] },
          { text: "Grant utilisation updated",                                                    activities: [upload("Upload Grant Utilisation Update")] },
          { text: "Report shared with Foundation",                                                activities: [upload("Upload Foundation Report")] },
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
          { text: "Location visited — beneficiary population estimated",                          activities: [act("Hotspot Field Visit")] },
          { text: "Hotspot type confirmed — bus stand / railway / naka / shelter / hospital / other", activities: [voice("Log Hotspot Type Confirmation")] },
          { text: "TATA Ace access and parking confirmed — route driveable from existing stops",  activities: [voice("Log Vehicle Access Check")] },
          { text: "Optimal serving time window assessed for this location",                       activities: [voice("Log Serving Window Assessment")] },
          { text: "Overlap with existing DPs checked — no cannibalisation",                       activities: [voice("Log DP Overlap Check")] },
          { text: "Community / local authority informed of plans",                                activities: [voice("Log Community Notification")] },
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
          { text: "DP personnel candidate identified via Sampark/APSA network",                   activities: [voice("Identify DP Personnel Candidate")] },
          { text: "Candidate briefed on role — timing, kit, hygiene, reporting",                  activities: [act("DP Personnel Briefing Meeting")] },
          { text: "Agreement signed",                                                             activities: [upload("Upload Signed DP Agreement")] },
          { text: "Emergency contact and backup person identified",                               activities: [voice("Log Emergency Contact Details")] },
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
          { text: "Queue management protocol trained",                                            activities: [act("DP Training Session at Hotspot")] },
          { text: "Hygiene protocol trained",                                                     activities: [voice("Confirm Hygiene Protocol Trained")] },
          { text: "Kit setup and teardown trained — full mock with actual kit",                   activities: [act("Mock Setup at Hotspot")] },
          { text: "Daily reporting and loss documentation trained",                               activities: [voice("Confirm Reporting Training")] },
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
          { text: "New DP inserted into route sequence — FILO loading order updated",             activities: [upload("Upload Updated Route Plan")] },
          { text: "End-to-end timing recalculated — all DPs still within window",                 activities: [upload("Upload Recalculated Route Timing")] },
          { text: "Driver briefed on new stop",                                                   activities: [act("Route Update Meeting with Driver")] },
          { text: "Kit assembled and numbered for new DP",                                        activities: [upload("Upload New DP Kit Inventory")] },
          { text: "Vehicle bay layout updated — new kit confirmed to fit",                        activities: [upload("Upload Updated Bay Layout")] },
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
          { text: "First distribution day completed",                                             activities: [act("Day 1 Observation at New DP")] },
          { text: "Units served on Day 1 recorded",                                               activities: [upload("Upload Day 1 Units Record")] },
          { text: "Issues on Day 1 logged and resolved",                                          activities: [voice("Log Day 1 Issues")] },
          { text: "DP personnel debrief done",                                                    activities: [act("Post Day-1 Debrief with DP Person")] },
          { text: "DP marked active in programme tracker",                                        activities: [upload("Upload DP Activation Record")] },
        ],
      },
    ],
  );

  console.log("\n✅ All done.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
