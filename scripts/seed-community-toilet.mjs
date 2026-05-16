// Seed two GoalTemplateDef rows for Community Sanitation Complex:
//   - community-toilet           (9 pitstops, new builds)
//   - community-toilet-existing  (2 pitstops, ongoing supervision)
// Run with: node --env-file=/tmp/.env.app.pulled /tmp/seed-community-toilet.mjs
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);

const NEW_BUILD = {
  slug: 'community-toilet',
  name: 'Community Sanitation Complex',
  description: 'Integrated toilet + bathing + laundry + drinking-water complex (Suvidha-type), with greywater recycling. New-build template.',
  category: 'Community Programs',
  icon: '🚽',
  needsDomain: null,
  linkedFacilityLayerKey: null,
  sortOrder: 95, // place after water-atm (sortOrder values can be reordered later)
  parameters: [
    { key: 'complexes',  type: 'number', label: 'Number of complexes', min: 1, max: 5,    placeholder: 'e.g. 1' },
    { key: 'seats',      type: 'number', label: 'Total toilet seats',  min: 10, max: 200, placeholder: 'e.g. 30' },
    { key: 'households', type: 'number', label: 'Households in catchment', min: 100, max: 2000, placeholder: 'e.g. 500' },
  ],
  pitstops: [
    {
      title: 'Site, Land Tenure & Water Source Assessment',
      type: 'Research',
      slaDays: 28,
      notes: 'The single most common killer of community sanitation projects is land tenure. RP secures a formal lease or MoU (15+ years minimum) before any capital is committed. Site must be within 200–300 metres of all target households — beyond that distance, communities revert to open defecation even with a working facility nearby. Water source assessment runs in parallel: the complex needs 15,000–25,000 L/day with greywater recycling; double that without.',
      checklist: [
        { text: 'RP identifies candidate plot (300–500 sq m minimum) within 200–300 metres walking distance of all target households', activities: [{ title: 'Candidate Site Survey', completionType: 'Voice' }] },
        { text: 'RP secures formal land agreement (15+ year lease / MoU) with BBMP / TNSCB / ULB / landowner — no capital committed before this is signed', activities: [{ title: 'Land MoU / Lease Document', completionType: 'Upload' }] },
        { text: 'Confirm sewer line proximity for blackwater disposal; if absent, plan for septic tank + FSTP hookup or biodigester', activities: [{ title: 'Sewer / Drainage Network Survey', completionType: 'Activity' }] },
        { text: 'Borewell or municipal water source assessed: TDS, hardness, microbial; full NABL lab panel if borewell will be used', activities: [{ title: 'Water Source Lab Test Report', completionType: 'Upload' }] },
        { text: 'Confirm commercial electrical connection available (single or 3-phase); plan backup (stabiliser / UPS / solar)', activities: [{ title: 'Electrical Supply Confirmation', completionType: 'Activity' }] },
        { text: 'Avoid sites in flood-prone low-lying areas (monsoon inundation risk) or adjacent to open drains / waste dumps (odour, vandalism)', activities: [{ title: 'Flood + Hygiene Risk Walk-through', completionType: 'Voice' }] },
        { text: 'Soil investigation report for G+2 foundation design', activities: [{ title: 'Soil Test Report', completionType: 'Upload' }] },
      ],
    },
    {
      title: 'Community Demand & CMC Formation',
      type: 'Meeting',
      slaDays: 42,
      notes: 'RPs go door-to-door before any design work. We need real demand: household count, gender-disaggregated willingness-to-pay, peak-hour load. The single best predictor of long-term sustainability is community ownership — formed through the Community Management Committee (CMC). 5–7 members including at least 3 women, an SHG representative, and one elderly or differently-abled member. CMC governs tariff changes, complaints, and operator renewal.',
      checklist: [
        { text: 'Door-to-door household count and OD prevalence survey within service radius', activities: [{ title: 'Household Demand Survey', completionType: 'Upload' }] },
        { text: 'Willingness-to-pay survey at multiple price points (Re.1 / ₹2 / ₹3 per use; ₹100–200 / month pass)', activities: [{ title: 'Willingness-to-Pay Survey', completionType: 'Upload' }] },
        { text: 'Gender-disaggregated focus groups on bathing / laundry / safety needs — women’s inputs drive design', activities: [{ title: 'Women’s Focus Group', completionType: 'Voice' }] },
        { text: 'Identify peak-hour windows (5–8 AM, 8–10 PM) and size for peak load', activities: [{ title: 'Peak Usage Mapping', completionType: 'Activity' }] },
        { text: 'Form Community Management Committee (5–7 members; ≥3 women; SHG rep; elderly / differently-abled rep)', activities: [{ title: 'CMC Formation Meeting', completionType: 'Voice' }] },
        { text: 'CMC drafts and signs governance charter (tariff approval, complaint adjudication, operator review process)', activities: [{ title: 'CMC Charter', completionType: 'Upload' }] },
        { text: 'RP verifies CMC membership and conducts orientation on roles, dashboard reading, and decision cadence', activities: [{ title: 'CMC Orientation', completionType: 'Voice' }] },
      ],
    },
    {
      title: 'Regulatory Clearances & Funding',
      type: 'Proposal',
      slaDays: 56,
      notes: 'Six clearances run in parallel; any one held up blocks construction. SBM-U 2.0 grant (₹98,000 / WC seat + ₹32,000 / urinal from GoI) is the primary capital window; AMRUT 2.0 covers water / sewerage / FSSM. Additional gap funding typically covers 30–40% of capex. Submit the SBM application early — it has long review cycles.',
      checklist: [
        { text: 'Building plan approval submitted to BBMP (Bangalore) or CMDA / local municipal body (Chennai)', activities: [{ title: 'Building Plan Submission', completionType: 'Upload' }] },
        { text: 'KSPCB / TNPCB Consent to Establish (CTE) applied for greywater plant + septic / biodigester', activities: [{ title: 'SPCB CTE Application', completionType: 'Upload' }] },
        { text: 'FSSAI registration applied for the Water ATM service component', activities: [{ title: 'FSSAI Registration', completionType: 'Upload' }] },
        { text: 'CGWB / SGWB NoC for new borewell (if applicable)', activities: [{ title: 'CGWB Borewell NoC', completionType: 'Upload' }] },
        { text: 'Fire NoC for G+2 structure from state fire department', activities: [{ title: 'Fire NoC', completionType: 'Upload' }] },
        { text: 'SBM-U 2.0 grant application submitted via BBMP / TNSCB', activities: [{ title: 'SBM-U 2.0 Application', completionType: 'Upload' }] },
        { text: 'Additional / gap funding window confirmed (typically 30–40% of capex)', activities: [{ title: 'Funding Commitment Letter', completionType: 'Upload' }] },
      ],
    },
    {
      title: 'Architectural Design & Procurement',
      type: 'Budgeting',
      slaDays: 84,
      notes: 'G+2 building: ground floor WC blocks (separate male / female + child + differently-abled), first floor bathing + laundromat, second floor RO water + greywater plant + storage tanks. Anti-slip R11 floor tiles mandatory. Plumbing must keep blackwater and greywater on separate lines from day one — retrofit is near-impossible. Procure industrial-grade washing machines rated for 8–10 hours daily continuous operation; domestic machines fail within weeks under community use intensity.',
      checklist: [
        { text: 'G+2 architectural drawings to per-floor brief; female WC share 55–60% of total seats; at least 1 unisex differently-abled WC per gender', activities: [{ title: 'Architectural Drawings', completionType: 'Upload' }] },
        { text: 'Structural engineer sign-off (RCC frame; IS 1893 seismic compliance — Zone II Bangalore / III Chennai)', activities: [{ title: 'Structural Engineer Sign-off', completionType: 'Upload' }] },
        { text: 'Sanitary fittings procured: SATO low-flush or 6L cisterns, push-valve showers / taps, anti-slip floor tiles (R11)', activities: [{ title: 'Sanitary Fittings PO', completionType: 'Upload' }] },
        { text: 'Industrial / semi-commercial washing machines procured (5–10 kg, front-load, rated for 8–10 hours continuous) + spin dryers', activities: [{ title: 'Laundry Equipment PO', completionType: 'Upload' }] },
        { text: 'RO plant + Water ATM unit procured (1,000 LPH for 300–500 HH; includes RFID + IoT)', activities: [{ title: 'RO Plant PO', completionType: 'Upload' }] },
        { text: 'Greywater treatment unit procured (MBBR-based packaged unit, 15–30 KLD)', activities: [{ title: 'Greywater STP PO', completionType: 'Upload' }] },
        { text: 'Solar PV system procured (3–5 kWp + inverter + battery bank)', activities: [{ title: 'Solar PV PO', completionType: 'Upload' }] },
        { text: 'Storage tanks (50,000 L total OH + UG, food-grade); septic tank or biodigester (if no sewer connection)', activities: [{ title: 'Storage + Septage PO', completionType: 'Upload' }] },
      ],
    },
    {
      title: 'Civil + Equipment Installation',
      type: 'SiteVisit',
      slaDays: 168,
      notes: 'Construction sequence is critical: blackwater and greywater plumbing lines must be physically separated and labelled at every junction — there’s no second chance once the slab is poured. Roof waterproofing must be complete before solar installation. RP visits weekly during civil works; photo log every milestone.',
      checklist: [
        { text: 'Civil structure: plant room, RCC frame G+2, foundation work for storage tanks', activities: [{ title: 'Civil Construction Photo Log', completionType: 'Upload' }] },
        { text: 'Plumbing installation: blackwater + greywater lines physically separated and labelled at every junction', activities: [{ title: 'Plumbing Separation Check', completionType: 'Voice' }] },
        { text: 'Sub-surface works: underground water cistern, septic tank or biodigester chamber, greywater collection sump', activities: [{ title: 'Sub-surface Works Photos', completionType: 'Upload' }] },
        { text: 'Electrical wiring + BESCOM / TANGEDCO commercial connection approved and energised', activities: [{ title: 'Electrical Inspection Certificate', completionType: 'Upload' }] },
        { text: 'Equipment installed: RO plant, greywater treatment unit, washing machines, spin dryers, water ATM dispensing unit', activities: [{ title: 'Equipment Installation Sign-off', completionType: 'Upload' }] },
        { text: 'Roof waterproofing complete; solar PV panels installed; net-metering applied for', activities: [{ title: 'Solar Install Photos', completionType: 'Upload' }] },
        { text: 'IoT monitoring + RFID / UPI payment system configured; cloud dashboard live', activities: [{ title: 'IoT + Payment System Test', completionType: 'Activity' }] },
        { text: 'RP site visits weekly during this phase; photo log + voice notes captured every visit', activities: [{ title: 'Weekly RP Site Visit', completionType: 'Voice' }] },
      ],
    },
    {
      title: 'Commissioning & Compliance Testing',
      type: 'Milestone',
      slaDays: 175,
      notes: '48-hour soak test runs every system at design load. Water quality tests for both the RO product water (IS 10500 BIS standards) and greywater effluent (BOD <10 mg/L, turbidity <5 NTU per IS 16101) must pass before any user is admitted. FSSAI sample submission is mandatory for the water ATM service. Skip none of this; commissioning gaps surface as community trust collapses later.',
      checklist: [
        { text: '48-hour continuous operational test of all systems (toilets flushing, showers, washing machines, RO, greywater)', activities: [{ title: '48-hr Soak Test Log', completionType: 'Upload' }] },
        { text: 'RO product water tested against IS 10500 BIS standards at NABL lab (TDS, microbial, chemical)', activities: [{ title: 'RO Product Water Test', completionType: 'Upload' }] },
        { text: 'Greywater effluent tested: BOD <10 mg/L, turbidity <5 NTU, E. coli not detected (IS 16101)', activities: [{ title: 'Greywater Effluent Test', completionType: 'Upload' }] },
        { text: 'FSSAI water sample submission for pre-operation compliance', activities: [{ title: 'FSSAI Sample Submission', completionType: 'Upload' }] },
        { text: 'All payment modes tested end-to-end (RFID swipe, UPI QR, coin if installed, AePS if installed)', activities: [{ title: 'Payment System E2E Test', completionType: 'Activity' }] },
        { text: 'Safety walk-through: night lighting working, door latches functional, ventilation adequate, anti-slip floor verified', activities: [{ title: 'Safety Walk-through', completionType: 'Voice' }] },
        { text: 'RP signs commissioning report — facility ready for soft launch', activities: [{ title: 'Commissioning Sign-off', completionType: 'Upload' }] },
      ],
    },
    {
      title: 'Operator Recruitment & Staff Training',
      type: 'Training',
      slaDays: 196,
      notes: 'The lead caretaker is the most critical hire for long-term success. Preference: woman with SHG background and community standing. Total team is 6–10 FTEs across 3 shifts (caretakers, cashier, plant operator, laundry supervisor, community coordinator). Training covers cleaning protocol, payment system, basic maintenance, complaint management, and gender-sensitivity.',
      checklist: [
        { text: 'Lead caretaker / operator recruited (preferably woman with SHG background)', activities: [{ title: 'Lead Operator Hired', completionType: 'Activity' }] },
        { text: 'Full team (6–10 FTEs) recruited: 3-shift caretakers, cashier / pass manager, plant operator, laundry supervisor, community coordinator', activities: [{ title: 'Team Hiring List', completionType: 'Upload' }] },
        { text: 'Operator training on cleaning protocol (3-shift cycle), shift register, cleanliness scoring', activities: [{ title: 'Cleaning Protocol Training', completionType: 'Voice' }] },
        { text: 'Payment system training: RFID issuance, UPI reconciliation, cash audit, monthly pass renewal', activities: [{ title: 'Payment System Training', completionType: 'Voice' }] },
        { text: 'Basic maintenance training: drain clearing, lock servicing, machine filter cleaning, RO membrane CIP', activities: [{ title: 'Maintenance Training', completionType: 'Voice' }] },
        { text: 'Complaint management and gender-sensitivity training; escalation pathway to CMC and RP', activities: [{ title: 'Gender + Complaints Training', completionType: 'Voice' }] },
        { text: 'Plant operator certified on RO + greywater plant operation; weekly DO check + monthly BOD test procedure', activities: [{ title: 'Plant Operator Certification', completionType: 'Upload' }] },
      ],
    },
    {
      title: 'Soft Launch & Household Registration',
      type: 'Meeting',
      slaDays: 224,
      notes: 'A soft launch with subsidised pricing breaks the first-use barrier — the same logic as RFID free-trial credit at water ATMs. Door-to-door household registration with RFID + monthly pass issuance is the single most reliable predictor of sustained adoption. Free-use demo day generates word-of-mouth; without it, uptake stalls.',
      checklist: [
        { text: 'Free-use demo day with full-service demonstration (toilet, bath, laundry, drinking water); CMC + ward councillor invited', activities: [{ title: 'Free-Use Demo Day', completionType: 'Voice' }] },
        { text: 'Door-to-door household registration; RFID cards + monthly passes issued with photo + household ID', activities: [{ title: 'Household Registration Log', completionType: 'Upload' }] },
        { text: 'Subsidised trial pricing (4–6 weeks at 50% rate) to break first-use barrier', activities: [{ title: 'Trial Pricing Window', completionType: 'Activity' }] },
        { text: 'Agent network activated: 2–4 community agents (SHG / shopkeeper) trained to sell + recharge passes on commission', activities: [{ title: 'Agent Network Activation', completionType: 'Activity' }] },
        { text: 'Free / social quota programmed in payment system: 10–15% of daily capacity reserved for verified extreme-poverty / disability / child users', activities: [{ title: 'Social Quota Configuration', completionType: 'Activity' }] },
        { text: 'Weekly check-ins for first 4 weeks; CMC + RP debrief on adoption, complaints, queue patterns', activities: [{ title: 'Week-1 to Week-4 Debrief', completionType: 'Voice' }] },
      ],
    },
    {
      title: 'Formal Inauguration & Community Anchoring',
      type: 'Milestone',
      slaDays: 252,
      notes: 'The formal inauguration is more than ceremony — it cements public legitimacy and creates the first occasion for CMC, ULB ward councillor, and funder to be visibly bound to the complex’s success. Community press coverage helps. The first monthly community feedback meeting at the complex anchors the ongoing cadence.',
      checklist: [
        { text: 'Formal inauguration event with CMC, ULB ward councillor, funder partner, women community leaders', activities: [{ title: 'Inauguration Event Photos', completionType: 'Upload' }] },
        { text: 'Community press release / WhatsApp coverage to nearby slums and ward', activities: [{ title: 'Press / Social Coverage', completionType: 'Upload' }] },
        { text: 'First monthly community feedback meeting held at the complex; minutes posted on noticeboard', activities: [{ title: 'First Community Feedback Meeting', completionType: 'Voice' }] },
        { text: 'Monthly cleanliness rating board installed at entrance (1–5 star peer accountability board)', activities: [{ title: 'Cleanliness Board Live', completionType: 'Activity' }] },
        { text: 'Public dashboard set up: monthly footfall, revenue, cleanliness score, water quality test results visible to community', activities: [{ title: 'Public Dashboard Live', completionType: 'Activity' }] },
        { text: 'RP signs handover from project mode to ongoing-operations mode; CMC + lead operator now responsible', activities: [{ title: 'Project-to-Ops Handover', completionType: 'Upload' }] },
      ],
    },
  ],
};

const EXISTING = {
  slug: 'community-toilet-existing',
  name: 'Community Sanitation Complex (Existing)',
  description: 'Ongoing supervision template for an operational community sanitation complex. Use this for monthly + quarterly review cadence.',
  category: 'Community Programs',
  icon: '🚽',
  needsDomain: null,
  linkedFacilityLayerKey: null,
  sortOrder: 96,
  parameters: [],
  pitstops: [
    {
      title: 'Monthly Operations Review',
      type: 'Review',
      slaDays: 30,
      notes: 'Cleanliness audit + revenue-vs-footfall reconciliation are the two most predictive monthly checks. Divergence >10% triggers a cash audit. Independent community audit by a CMC member or SHG rep posts publicly. Monthly NABL water test for RO product is non-negotiable.',
      checklist: [
        { text: 'Independent community cleanliness audit by CMC member / SHG rep using standardised checklist; score posted publicly', activities: [{ title: 'Cleanliness Audit', completionType: 'Upload' }] },
        { text: 'Revenue vs footfall reconciliation: daily revenue from all sources matched against footfall count; divergence >10% triggers cash audit', activities: [{ title: 'Revenue Reconciliation Report', completionType: 'Upload' }] },
        { text: 'NABL lab test for RO product water (TDS, microbial); greywater effluent BOD spot test', activities: [{ title: 'Monthly NABL Lab Test', completionType: 'Upload' }] },
        { text: 'Pass renewal drive: chase households whose monthly passes lapsed; field follow-up for non-adopters', activities: [{ title: 'Pass Renewal Outreach', completionType: 'Activity' }] },
        { text: 'Maintenance log review: pump checks, machine filter cleaning, UV lamp hours, membrane flux', activities: [{ title: 'Maintenance Log Review', completionType: 'Upload' }] },
        { text: 'Community feedback meeting at the complex (30–45 min, open to all users); minutes posted on noticeboard', activities: [{ title: 'Monthly Feedback Meeting', completionType: 'Voice' }] },
        { text: 'RP visits for monthly review; signs off cleanliness score, revenue split, action items', activities: [{ title: 'Monthly RP Visit', completionType: 'Voice' }] },
      ],
    },
    {
      title: 'Quarterly Independent Audit',
      type: 'Review',
      slaDays: 90,
      notes: 'Quarterly check breaks out of monthly noise: third-party NABL water testing, operational review with the full funder + CMC table, and an evidence-based tariff review. Septic tank desludging schedule check ensures we’re on track for the 3–5 year cycle.',
      checklist: [
        { text: 'Third-party NABL lab full water quality panel (RO + greywater effluent + biological)', activities: [{ title: 'Quarterly NABL Full Panel', completionType: 'Upload' }] },
        { text: 'Operational review with CMC + funder + lead operator; presentation of quarter’s performance dashboard', activities: [{ title: 'Quarterly Operational Review', completionType: 'Upload' }] },
        { text: 'Tariff review based on operating cost trend, footfall, social-quota usage; CMC approves any change', activities: [{ title: 'Tariff Review Decision', completionType: 'Upload' }] },
        { text: 'Septic tank inspection / desludging schedule check (every 3–5 years; ₹15–30K per event)', activities: [{ title: 'Septic Tank Status Check', completionType: 'Activity' }] },
        { text: 'Solar PV output check: monthly kWh trend; >20% drop signals soiling, shading, or inverter fault', activities: [{ title: 'Solar Output Audit', completionType: 'Upload' }] },
        { text: 'RP signs quarterly audit report; flags carried to next month’s review', activities: [{ title: 'Quarterly Audit Sign-off', completionType: 'Upload' }] },
      ],
    },
  ],
};

async function upsert(t) {
  // Idempotent: insert if absent, update if present (won't double-create on re-run)
  const existing = await sql`SELECT id FROM "GoalTemplateDef" WHERE slug = ${t.slug}`;
  if (existing.length === 0) {
    await sql`
      INSERT INTO "GoalTemplateDef"
        (id, slug, name, description, category, icon, "needsDomain", "linkedFacilityLayerKey", "sortOrder", parameters, pitstops, "isActive", "createdAt", "updatedAt")
      VALUES
        (${randomUUID()}, ${t.slug}, ${t.name}, ${t.description}, ${t.category}, ${t.icon}, ${t.needsDomain}, ${t.linkedFacilityLayerKey},
         ${t.sortOrder}, ${JSON.stringify(t.parameters)}::jsonb, ${JSON.stringify(t.pitstops)}::jsonb, true, now(), now())
    `;
    console.log(`INSERTED ${t.slug}  (${t.pitstops.length} pitstops, ${t.pitstops.reduce((n,p)=>n+(p.checklist?.length||0),0)} checklist items)`);
  } else {
    await sql`
      UPDATE "GoalTemplateDef" SET
        name = ${t.name},
        description = ${t.description},
        category = ${t.category},
        icon = ${t.icon},
        "needsDomain" = ${t.needsDomain},
        "linkedFacilityLayerKey" = ${t.linkedFacilityLayerKey},
        "sortOrder" = ${t.sortOrder},
        parameters = ${JSON.stringify(t.parameters)}::jsonb,
        pitstops = ${JSON.stringify(t.pitstops)}::jsonb,
        "isActive" = true,
        "updatedAt" = now()
      WHERE slug = ${t.slug}
    `;
    console.log(`UPDATED  ${t.slug}  (${t.pitstops.length} pitstops, ${t.pitstops.reduce((n,p)=>n+(p.checklist?.length||0),0)} checklist items)`);
  }
}

await upsert(NEW_BUILD);
await upsert(EXISTING);
console.log('Done.');
