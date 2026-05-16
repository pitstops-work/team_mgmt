// Batch 5: food distribution (3 decks)
// Run: node --env-file=/tmp/.env.app.pulled scripts/author-decks/05-food.mjs
import { applyBatch, whySlide } from '../_inject-deck.mjs';

// ─── Food Distribution Launch ────────────────────────────────────────────────
const FD_LAUNCH = {
  slug: 'food-distribution-launch',
  newSlide2Html: whySlide(
    `One meal can decide whether a child goes to school the next morning`,
    `The launch is a one-shot. The vendor contract, the kit, the truck, the DP personnel — all must land in the same week or we lose the credibility window.`,
    [
      [`~10,000 meals/day`,`our typical launch scale. One vendor (Ramani Food) · multiple distribution points (DPs) · single CO per DP · same time daily.`],
      [`300 op days/year`,`The Food domain beneficiary metric · per-meal × 300 op days = annual beneficiary count. Skip a day and the count drops.`],
      [`APSA confirmation`,`Authorised Public Sector Approval letter · the unlock that makes the partner accept our kits at school + community DPs · cannot launch without it`],
      [`Driver + truck backup`,`Single point of failure if not pre-arranged · JustDelivery responsible for replacement within 2 hrs of breakdown · contractual, not verbal`],
    ],
    `The launch goal closes on Day 1. The monthly operations goal takes over from Day 2. Plan the handover before the launch ends.`,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_fdl1">
      <div class="label" style="color:#34d399">LAUNCH WEEK FLOW</div>
      <h2 class="title">Vendor → Kit → DP personnel → Dry run → Day 1</h2>
      <h3 class="sub">Each pitstop unblocks the next. No parallel paths; the sequence is the rigour.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;max-width:1180px">
        ${[
          [`📜`,`Vendor + transport`,`Ramani contract signed · JustDelivery truck+driver assigned · backup driver MoU`,`#fbbf24`],
          [`📦`,`Kit + APSA`,`Lunchbox + spoon procurement · APSA letter received · kit stored at vendor end`,`#34d399`],
          [`👤`,`DP personnel`,`CO at each DP recruited + trained · weighing scale + register handed over`,`#38bdf8`],
          [`🧪`,`Dry run`,`One full simulated day · vendor → truck → DP → CO → log · catches every break`,`#c084fc`],
          [`🚀`,`Day 1 live`,`First real distribution · RP present at top 3 DPs · MIS entry from minute 1`,`#fb7185`],
        ].map(([icon,name,what,color],i,arr)=>`
          <div style="position:relative;padding:18px 14px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:10px;text-align:center">
            <div style="font-size:30px;margin-bottom:6px">${icon}</div>
            <div style="font-size:12px;font-weight:700;color:${color}">${name}</div>
            <div style="font-size:10px;color:#cbd5e1;margin-top:6px;line-height:1.5">${what}</div>
            ${i<arr.length-1?`<div style="position:absolute;top:38px;right:-10px;font-size:16px;color:${color};z-index:2">→</div>`:''}
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-amber" id="sX_fdl2">
      <div class="label" style="color:#fbbf24">DAY 1 MORNING TIMELINE</div>
      <h2 class="title">2:00 AM to 11:00 AM — what's happening where</h2>
      <div style="margin-top:28px;display:grid;gap:8px;max-width:1080px">
        ${[
          [`2:00 AM`,`Vendor kitchen starts cooking · RP present at kitchen for the first 3 days`,`#fb7185`],
          [`5:00 AM`,`Hot food packed in kit boxes · QC by RP · count matches DP roster`,`#fbbf24`],
          [`6:00 AM`,`Truck departs vendor · GPS-tracked · route fixed · ETA per DP shared with COs`,`#34d399`],
          [`7:00 AM`,`First DP receives · CO weighs sample · signs handover · distribution to children begins`,`#38bdf8`],
          [`8:30 AM`,`Mid-route DPs · CO logs delivered count · flags any kit shortage`,`#c084fc`],
          [`10:00 AM`,`Last DPs · school + community sites · attendance + meals delivered both logged`,`#a78bfa`],
          [`11:00 AM`,`Truck back to base · day-1 reconciliation · vendor sign-off · 1st-day debrief`,`#fb7185`],
        ].map(([t,what,color])=>`
          <div style="display:grid;grid-template-columns:90px 1fr;gap:14px;padding:10px 16px;background:rgba(255,255,255,.04);border-left:3px solid ${color};border-radius:8px;align-items:center">
            <div style="font-size:13px;font-weight:700;color:${color}">${t}</div>
            <div style="font-size:13px;color:#cbd5e1;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div></div>`],
};

// ─── Food Distribution Monthly ──────────────────────────────────────────────
const FD_MONTHLY = {
  slug: 'food-distribution-monthly',
  newSlide2Html: whySlide(
    `Monthly check is the heartbeat that catches drift before it becomes scandal`,
    `Units delivered · DP coverage · vendor SLA · kit + vehicle audit · DP personnel check-in · MIS + grant reporting. All five hit every month, on date.`,
    [
      [`Units + DP cov.`,`Total meals delivered · per-DP coverage · attendance trend · children missed → re-route`],
      [`Ramani SLA`,`On-time delivery % · meal quality complaints · cooking gas/oil hygiene · vendor's monthly report`],
      [`Kit + vehicle`,`Lunchbox condition · sanitation · vehicle log · driver behaviour · backup readiness check`],
      [`DP personnel`,`CO check-in · attendance · training refresh · attrition flag · ZL one-on-one if needed`],
      [`MIS + grant`,`Funder report data prep · MIS data quality audit · variance vs commitment · escalation if amber`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-indigo" id="sX_fdm1">
      <div class="label" style="color:#a78bfa">MONTHLY DASHBOARD</div>
      <h2 class="title">The numbers we review in the monthly</h2>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px">
        ${[
          [`Total meals delivered`,`Target vs actual · per-DP breakdown · trend vs last 3 months`,`#fbbf24`],
          [`Beneficiary attendance`,`Per-DP child attendance · drop-out flag if 3 consecutive misses`,`#34d399`],
          [`On-time delivery %`,`Vendor SLA · target ≥ 95% on-time · breach triggers vendor conversation`,`#38bdf8`],
          [`Complaints logged`,`Quality / quantity / hygiene · closed in 48 hrs (minor), 7 days (major)`,`#c084fc`],
          [`Kit + truck audit`,`Random DP visit · audit kit cleanliness · truck log + GPS · driver check`,`#fb7185`],
          [`Variance vs grant`,`Monthly burn vs grant plan · forecast remaining · alert if amber/red`,`#a78bfa`],
        ].map(([m,what,color])=>`
          <div style="padding:18px;background:rgba(255,255,255,.05);border-left:3px solid ${color};border-radius:10px">
            <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:6px">${m}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.55">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-rose" id="sX_fdm2">
      <div class="label" style="color:#fb7185">VENDOR SLA REVIEW</div>
      <h2 class="title">Ramani's monthly card — what we score · what we escalate</h2>
      <div style="margin-top:28px;padding:24px;background:rgba(251,113,133,.06);border:1px solid rgba(251,113,133,.25);border-radius:14px;max-width:1100px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="border-bottom:1px solid rgba(251,113,133,.3);color:#fb7185;text-align:left">
            <th style="padding:10px 12px;font-weight:700">SLA</th><th style="padding:10px 12px;font-weight:700">Target</th><th style="padding:10px 12px;font-weight:700">Breach action</th>
          </tr></thead>
          <tbody style="color:#cbd5e1">
            <tr style="border-bottom:1px solid rgba(255,255,255,.05)"><td style="padding:12px">On-time delivery</td><td>≥ 95%</td><td>Conversation if &lt; 95% · penalty if &lt; 90%</td></tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,.05)"><td style="padding:12px">Meal quality complaints</td><td>≤ 2/month</td><td>Vendor visit + kitchen audit if &gt; 2</td></tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,.05)"><td style="padding:12px">Kit hygiene (random audit)</td><td>≥ 8/10</td><td>Re-train kitchen staff if &lt; 8</td></tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,.05)"><td style="padding:12px">Driver / truck reliability</td><td>≤ 1 breakdown/mo</td><td>Backup activation log · JustDelivery escalation</td></tr>
            <tr><td style="padding:12px">Cost per meal</td><td>contract rate</td><td>Quarterly true-up · grain price escalation only with evidence</td></tr>
          </tbody>
        </table>
      </div></div>`],
};

// ─── Food Distribution New DP ───────────────────────────────────────────────
const FD_NEW_DP = {
  slug: 'food-distribution-new-dp',
  newSlide2Html: whySlide(
    `A new DP is added not opportunistically but because the assessment justified it`,
    `Every new DP increases truck load, kitchen output, MIS rows, CO bandwidth. Add poorly and the whole route gets disrupted.`,
    [
      [`Hotspot first`,`Field assessment confirms gap · existing DPs cannot absorb · children's transit pattern justifies a new node`],
      [`DP personnel ready`,`CO recruited + trained · weighing scale + register + uniform · committed to 6+ months before activation`],
      [`Route integration`,`Truck route re-planned · ETA shifts to existing DPs noted · all COs briefed before Day 1`],
      [`First live`,`RP at the new DP for first 3 days · vendor sample count · attendance log · sign-off after day 5`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_fdnd1">
      <div class="label" style="color:#34d399">NEW DP ACTIVATION FLOW</div>
      <h2 class="title">Five steps · 4–6 weeks · zero shortcuts</h2>
      <div style="margin-top:28px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;max-width:1180px">
        ${[
          [`🔍`,`Hotspot scan`,`CO walks the cluster · counts children currently unserved · maps current vs gap`,`Week 1`,`#fbbf24`],
          [`👤`,`Personnel sourced`,`DP personnel candidate identified · CO interview · partner verification · trial`,`Week 2`,`#34d399`],
          [`🎓`,`Training + kit`,`Personnel trained on log, weighing, escalation · kit handed over`,`Week 3`,`#38bdf8`],
          [`🗺`,`Route plan`,`Truck route re-planned · ETAs to all DPs updated · all COs briefed`,`Week 4`,`#c084fc`],
          [`🚀`,`First live`,`Activation day · RP present 3 days · sign-off after day 5 · MIS row added`,`Week 5–6`,`#fb7185`],
        ].map(([icon,name,what,when,color])=>`
          <div style="padding:16px 12px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:10px;text-align:center">
            <div style="font-size:26px;margin-bottom:6px">${icon}</div>
            <div style="font-size:12px;font-weight:700;color:${color}">${name}</div>
            <div style="font-size:10px;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-top:4px">${when}</div>
            <div style="font-size:10px;color:#cbd5e1;margin-top:6px;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-violet" id="sX_fdnd2">
      <div class="label" style="color:#c084fc">HOTSPOT ASSESSMENT</div>
      <h2 class="title">Six criteria a new DP must clear</h2>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px">
        ${[
          [`Unserved kids`,`Min 30 children currently outside any existing DP catchment · count, not estimate`,`#fbbf24`],
          [`Existing DP capacity`,`Nearest 2 DPs both at >85% capacity · no headroom to absorb · justifies a new node`,`#fb7185`],
          [`Safe access`,`Children can walk to DP without crossing major road or unsafe stretch · women adults verified`,`#34d399`],
          [`Personnel available`,`Local candidate exists · partner can vet · 6-month commitment achievable`,`#38bdf8`],
          [`Route feasibility`,`Within 20-min detour from current truck route · ETA impact on existing DPs ≤ 15 min`,`#c084fc`],
          [`Sustained demand`,`Demand likely to hold 12+ months · not a one-off post-disaster spike that will fade`,`#a78bfa`],
        ].map(([c,what,color])=>`
          <div style="padding:18px;background:rgba(255,255,255,.05);border-left:3px solid ${color};border-radius:10px">
            <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:6px">${c}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.55">${what}</div>
          </div>`).join('')}
      </div></div>`],
};

await applyBatch([FD_LAUNCH, FD_MONTHLY, FD_NEW_DP]);
