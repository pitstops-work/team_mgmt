// Batch 4: zonal leadership (5 decks)
// Run: node --env-file=/tmp/.env.app.pulled scripts/author-decks/04-zonal.mjs
import { applyBatch, whySlide } from '../_inject-deck.mjs';

// ─── Zone Review Cadence ─────────────────────────────────────────────────────
const ZR = {
  slug: 'zone-review',
  newSlide2Html: whySlide(
    `Reviews are how a zone keeps from drifting`,
    `Without a cadence, RPs slowly redefine their own success metrics and partner data quality decays. The review is the ZL's most leveraged hour.`,
    [
      [`Monthly RP audit`,`Spot-check 10% of every RP's MIS entries · catch hallucinations early · same audit format zone-wide`],
      [`Variance report`,`Plan vs actual per programme per RP · variances >20% need a written reason · not a verbal one`],
      [`Zone review mtg`,`90 min · agenda is the variance + 1 deep-dive programme · attendance non-negotiable for RPs`],
      [`Annual zone plan`,`Once a year · zone-wide priorities · resource allocation · RP-level commitments · presented to leadership`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-indigo" id="sX_zr1">
      <div class="label" style="color:#a78bfa">MONTHLY REVIEW STRUCTURE</div>
      <h2 class="title">90 minutes · 5 blocks · zero soft-talk</h2>
      <div style="margin-top:28px;display:grid;gap:8px;max-width:1100px">
        ${[
          [`0–10 min`,`Variance scoreboard up · who is green / amber / red · no commentary yet`,`#fbbf24`],
          [`10–35 min`,`Red items · the RP owns the explanation · ZL probes for root cause, not symptom`,`#fb7185`],
          [`35–55 min`,`Deep-dive one programme · rotate monthly · go below KPIs into mechanism`,`#38bdf8`],
          [`55–75 min`,`Cross-RP unblockers · partner pain points · ZL commits to escalation by name`,`#c084fc`],
          [`75–90 min`,`Action list · next-month metric targets · owner + date · circulated within 24 hrs`,`#34d399`],
        ].map(([t,what,color])=>`
          <div style="display:grid;grid-template-columns:90px 1fr;gap:14px;padding:10px 16px;background:rgba(255,255,255,.04);border-left:3px solid ${color};border-radius:8px;align-items:center">
            <div style="font-size:13px;font-weight:700;color:${color}">${t}</div>
            <div style="font-size:13px;color:#cbd5e1;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-amber" id="sX_zr2">
      <div class="label" style="color:#fbbf24">DATA AUDIT METHOD</div>
      <h2 class="title">10% spot-check per RP per month — the only way to keep MIS honest</h2>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px">
        ${[
          [`🎯`,`Random sample`,`Pick 10% of MIS entries per RP at random · don't ask the RP to pick · use a random number generator`,`#fbbf24`],
          [`📞`,`Field verify`,`Call the beneficiary directly · ask one specific date / event · their version is ground truth`,`#34d399`],
          [`📊`,`Match + flag`,`Match MIS vs beneficiary version · gap > 20% = full audit of that RP this month`,`#fb7185`],
          [`📝`,`Document`,`Audit log per RP · trend over months · 3 consecutive bad audits = ZL personal review with RP`,`#38bdf8`],
        ].map(([icon,name,what,color])=>`
          <div style="padding:18px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:10px">
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><div style="font-size:22px">${icon}</div><div style="font-size:13px;font-weight:700;color:${color}">${name}</div></div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.55">${what}</div>
          </div>`).join('')}
      </div></div>`],
};

// ─── Grant & Proposal ────────────────────────────────────────────────────────
const GP = {
  slug: 'grant-proposal',
  newSlide2Html: whySlide(
    `A proposal is a contract that funds three years of work`,
    `Cutting corners on the proposal — vague outcomes, soft numbers, missing risk — produces three years of internal arguments later. Front-load the rigour.`,
    [
      [`Needs first`,`Don't write the proposal off the funder RFP. Start from a real needs assessment in your geography. The funder fit is downstream of the need.`],
      [`Concept note`,`2-page version before the full proposal · alignment check with funder · saves 4 weeks of rework if mis-aligned`],
      [`Specific outcomes`,`"500 households enrolled in PMJAY with cards in hand by month 18" beats "improve health outcomes". Vague outcomes are unbankable.`],
      [`Honest risks`,`Funders trust founders who name risks · those who hide risks fool nobody and lose credibility on the renewal conversation`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_gp1">
      <div class="label" style="color:#34d399">PROPOSAL LIFECYCLE</div>
      <h2 class="title">Five stages · 60–90 days from needs to signed agreement</h2>
      <div style="margin-top:28px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;max-width:1180px">
        ${[
          [`🧭`,`Needs assessment`,`Field data · gap analysis · alternatives considered`,`Week 1–2`,`#fbbf24`],
          [`📄`,`Concept note`,`2-pager · alignment call with funder · go/no-go`,`Week 3–4`,`#34d399`],
          [`📑`,`Full proposal`,`Detailed log frame · outcomes · budget · risk · MIS plan`,`Week 5–8`,`#38bdf8`],
          [`🤝`,`Funder engagement`,`Q&A · site visit · revised proposal · investment committee`,`Week 9–11`,`#c084fc`],
          [`✍️`,`Agreement`,`Term sheet · MOU · tranche schedule · audit + reporting cadence`,`Week 12`,`#fb7185`],
        ].map(([icon,name,what,when,color])=>`
          <div style="padding:14px 12px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:10px">
            <div style="text-align:center;font-size:26px;margin-bottom:6px">${icon}</div>
            <div style="text-align:center;font-size:12px;font-weight:700;color:${color}">${name}</div>
            <div style="text-align:center;font-size:10px;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-top:4px">${when}</div>
            <div style="font-size:10px;color:#cbd5e1;margin-top:8px;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-violet" id="sX_gp2">
      <div class="label" style="color:#c084fc">ANATOMY OF A GOOD OUTCOME</div>
      <h2 class="title">SMART + verifiable + funder-checkable</h2>
      <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:1100px">
        <div style="padding:24px;background:rgba(251,113,133,.08);border:1px solid rgba(251,113,133,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#fb7185;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Don't write this</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.85">
            <li>· "Improve health outcomes"</li>
            <li>· "Empower women"</li>
            <li>· "Build capacity"</li>
            <li>· "Strengthen ecosystem"</li>
            <li>· "Significantly increase awareness"</li>
          </ul>
          <p class="body" style="margin-top:10px;font-size:12px;color:#fda4af;font-style:italic">No way to verify. No way to course-correct. No way for funder to know they got value.</p>
        </div>
        <div style="padding:24px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#34d399;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Write this</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.85">
            <li>· 500 HHs enrolled in PMJAY · card in hand · by M18</li>
            <li>· 80 women in 8 SHGs · 6+ months active · M12</li>
            <li>· 40 CO trained · 5-day cert · placement in 60d · M9</li>
            <li>· 12 partner CSOs signed · joint review held · M24</li>
            <li>· 75% of target HHs report knowing about scheme X · M6</li>
          </ul>
          <p class="body" style="margin-top:10px;font-size:12px;color:#86efac;font-style:italic">Verifiable · time-bound · falsifiable. Easy to celebrate when met, easy to flag when missed.</p>
        </div>
      </div></div>`],
};

// ─── Grant Renewal ───────────────────────────────────────────────────────────
const GP_R = {
  slug: 'grant-proposal-renewal',
  newSlide2Html: whySlide(
    `Renewals are won or lost on outcome reporting from the prior period`,
    `If the funder's IC member can summarise your year-2 outcomes in one sentence at the renewal meeting, you'll get renewed. If they can't, no proposal quality will save you.`,
    [
      [`Outcome story`,`Lead with the prior-period outcomes — measured against the original log-frame, not against new metrics. Hold yourself to what you promised.`],
      [`Lessons named`,`What didn't work? Funders trust renewals that say "X didn't work because Y · here's what we changed". Hiding misses kills the renewal.`],
      [`Scale or deepen`,`Renewal is either scale (same model, more geo) or deepen (same geo, sharper model). Pick one explicitly. Don't blur.`],
      [`Renewed risks`,`What's harder in years 4–6 than years 1–3? Founder fatigue · talent retention · sector saturation. Name them.`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-sky" id="sX_gpr1">
      <div class="label" style="color:#38bdf8">RENEWAL VS NEW</div>
      <h2 class="title">The two narratives are structurally different</h2>
      <div style="margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:1100px">
        <div style="padding:24px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#38bdf8;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">First grant narrative</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.85">
            <li>· The need · the gap</li>
            <li>· Who else is solving and why it's insufficient</li>
            <li>· Our theory of change</li>
            <li>· Team + capability evidence</li>
            <li>· What we'll do · outcomes · budget</li>
            <li>· Risks · mitigation</li>
          </ul>
        </div>
        <div style="padding:24px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#a78bfa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Renewal narrative</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.85">
            <li>· What we promised · what we delivered</li>
            <li>· What worked · why it worked</li>
            <li>· What didn't · what we changed</li>
            <li>· What the next chapter is — scale or deepen</li>
            <li>· Outcomes for the next period</li>
            <li>· New risks of years 4–6</li>
          </ul>
        </div>
      </div></div>`,`
<div class="slide bg-amber" id="sX_gpr2">
      <div class="label" style="color:#fbbf24">OUTCOME REPORTING TEMPLATE</div>
      <h2 class="title">Side-by-side table — promised vs delivered · public, unhedged</h2>
      <div style="margin-top:28px;padding:24px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.25);border-radius:14px;max-width:1100px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="border-bottom:1px solid rgba(251,191,36,.3);color:#fbbf24;text-align:left">
            <th style="padding:10px 12px;font-weight:700">Outcome</th><th style="padding:10px 12px;font-weight:700">Promised</th><th style="padding:10px 12px;font-weight:700">Delivered</th><th style="padding:10px 12px;font-weight:700">Status</th>
          </tr></thead>
          <tbody style="color:#cbd5e1">
            <tr style="border-bottom:1px solid rgba(255,255,255,.05)"><td style="padding:12px">HHs PMJAY enrolled</td><td>500 by M18</td><td>540 by M17</td><td style="color:#34d399;font-weight:700">✓ Exceeded</td></tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,.05)"><td style="padding:12px">SHGs active 6+ months</td><td>8 by M12</td><td>6 active, 2 dissolved</td><td style="color:#fbbf24;font-weight:700">⚠ Partial</td></tr>
            <tr style="border-bottom:1px solid rgba(255,255,255,.05)"><td style="padding:12px">CO trained + placed</td><td>40 by M9</td><td>40 trained, 32 placed</td><td style="color:#fbbf24;font-weight:700">⚠ Partial</td></tr>
            <tr><td style="padding:12px">Partner CSOs joint review</td><td>12 by M24</td><td>9 done · 3 pending</td><td style="color:#fb7185;font-weight:700">✗ Missed</td></tr>
          </tbody>
        </table>
        <p class="body" style="margin-top:14px;font-size:12px;color:#fcd34d;font-style:italic">Each Partial / Missed needs a narrative paragraph below: what happened, what we learned, what changes in renewal period. No spin.</p>
      </div></div>`],
};

// ─── Partner Management ──────────────────────────────────────────────────────
const PM = {
  slug: 'partner-management',
  newSlide2Html: whySlide(
    `Our work runs through partners. Bad partners cost more than no partners.`,
    `The partner is the operational arm we don't directly manage. The relationship is the only thing standing between funder expectations and field reality.`,
    [
      [`Due diligence first`,`Financial · governance · field track record · references · before signing any MoU. Partner failures usually trace to skipped DD.`],
      [`MoU not handshake`,`Written deliverables · milestone payments · data sharing · escalation path · exit clauses. Verbal agreements end in disputes.`],
      [`Quarterly joint review`,`Both sides at the table · same data view · same outcomes scorecard · one set of action items · no parallel narratives`],
      [`Annual health check`,`Once a year · governance + financial + programmatic + relationship temperature · written report · informs renewal decision`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-indigo" id="sX_pm1">
      <div class="label" style="color:#a78bfa">PARTNER LIFECYCLE</div>
      <h2 class="title">Six stages from sourcing to either renewal or graceful exit</h2>
      <div style="margin-top:28px;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;max-width:1180px">
        ${[
          [`🔍`,`Source`,`From own network · sector references · open invitation`,`#fbbf24`],
          [`📋`,`Due diligence`,`Financial · governance · field track · references · DD ID generated`,`#34d399`],
          [`✍️`,`MoU`,`Deliverables · tranche schedule · MIS · escalation · exit clauses`,`#38bdf8`],
          [`🚀`,`Onboarding`,`Tools handover · CO training · first-month touchpoints · joint kick-off`,`#c084fc`],
          [`🔄`,`Manage`,`Quarterly reviews · audits · joint problem-solving · escalation when needed`,`#a78bfa`],
          [`🏁`,`Renew or exit`,`Annual review · evidence-based renewal or structured wind-down · alumni network maintained`,`#fb7185`],
        ].map(([icon,name,what,color])=>`
          <div style="padding:16px 12px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:10px;text-align:center">
            <div style="font-size:24px;margin-bottom:6px">${icon}</div>
            <div style="font-size:12px;font-weight:700;color:${color}">${name}</div>
            <div style="font-size:10px;color:#cbd5e1;margin-top:6px;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-rose" id="sX_pm2">
      <div class="label" style="color:#fb7185">DUE DILIGENCE STAGES</div>
      <h2 class="title">8 stages — each gates the next</h2>
      <h3 class="sub">Run through /due-diligence in the platform. Don't sign MoU until all 8 stages are green.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;max-width:1180px">
        ${[
          [`Org profile`,`Founding · mission · scale · leadership bench`,`#fbbf24`],
          [`Governing body`,`Board composition · independence · meet cadence`,`#34d399`],
          [`Compliance`,`12A · 80G · FCRA · IT demands · all current`,`#38bdf8`],
          [`Statutory filings`,`Last 3 yrs · auditor notes · qualifications · clean`,`#c084fc`],
          [`Salary details`,`Senior team comp · ratios · disclosure`,`#a78bfa`],
          [`Funding history`,`Sources · concentration · dependency %`,`#fb7185`],
          [`Expenditure`,`Programme : admin ratio · capex vs opex`,`#5eead4`],
          [`PDD review`,`Programme design · M&E · field evidence`,`#fbbf24`],
        ].map(([stage,what,color])=>`
          <div style="padding:14px 12px;background:rgba(255,255,255,.04);border-top:3px solid ${color};border-radius:8px;min-height:90px">
            <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:4px">${stage}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div></div>`],
};

// ─── Partner Management Existing ────────────────────────────────────────────
const PM_EX = {
  slug: 'partner-management-existing',
  newSlide2Html: whySlide(
    `Existing partners drift when reviews go on autopilot`,
    `Quarterly review + audit + annual check are not paperwork — they are the only structured space where the relationship gets honest.`,
    [
      [`Quarterly review`,`Both sides bring data · review against MoU outcomes · one set of action items · 90 min · agenda fixed`],
      [`Deliverable audit`,`Spot-check claimed deliverables · field verify with beneficiaries · catches the 20% of partners drifting from spec`],
      [`Relationship temp`,`Direct conversation: what's frustrating you about us · what's working · candid signal beats survey`],
      [`Annual health`,`Written report · governance + financial + programmatic + relationship · used in renewal decision`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_pmex1">
      <div class="label" style="color:#34d399">QUARTERLY REVIEW STRUCTURE</div>
      <h2 class="title">90 min · 4 blocks · co-owned outcomes</h2>
      <div style="margin-top:28px;display:grid;gap:8px;max-width:1080px">
        ${[
          [`0–20 min`,`Outcomes scoreboard · MoU metrics · both sides agree on numbers before any discussion`,`#fbbf24`],
          [`20–50 min`,`What worked · what didn't · honest conversation · no defending the data`,`#34d399`],
          [`50–75 min`,`Joint problem-solving · unblockers · escalations to senior level`,`#38bdf8`],
          [`75–90 min`,`Next-quarter commitments · owner + date · circulated within 48 hrs`,`#c084fc`],
        ].map(([t,what,color])=>`
          <div style="display:grid;grid-template-columns:90px 1fr;gap:14px;padding:10px 16px;background:rgba(255,255,255,.04);border-left:3px solid ${color};border-radius:8px;align-items:center">
            <div style="font-size:13px;font-weight:700;color:${color}">${t}</div>
            <div style="font-size:13px;color:#cbd5e1;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-violet" id="sX_pmex2">
      <div class="label" style="color:#c084fc">RED-AMBER-GREEN HEALTH</div>
      <h2 class="title">When to renew · when to coach · when to wind down</h2>
      <div style="margin-top:28px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;max-width:1180px">
        <div style="padding:20px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3);border-radius:12px">
          <div style="font-size:14px;font-weight:700;color:#34d399;margin-bottom:10px">🟢 Green — renew</div>
          <ul style="list-style:none;padding:0;font-size:12px;color:#cbd5e1;line-height:1.7">
            <li>· MoU outcomes 80%+ delivered</li>
            <li>· Compliance clean · audit unqualified</li>
            <li>· Field data + own MIS aligned</li>
            <li>· Reviews on time, agenda-driven</li>
          </ul>
        </div>
        <div style="padding:20px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:12px">
          <div style="font-size:14px;font-weight:700;color:#fbbf24;margin-bottom:10px">🟡 Amber — coach</div>
          <ul style="list-style:none;padding:0;font-size:12px;color:#cbd5e1;line-height:1.7">
            <li>· 50–80% MoU delivery</li>
            <li>· Compliance gaps but in fix-mode</li>
            <li>· Some MIS drift · cohort visible</li>
            <li>· Reviews happening but unfocused</li>
          </ul>
        </div>
        <div style="padding:20px;background:rgba(251,113,133,.08);border:1px solid rgba(251,113,133,.3);border-radius:12px">
          <div style="font-size:14px;font-weight:700;color:#fb7185;margin-bottom:10px">🔴 Red — wind down</div>
          <ul style="list-style:none;padding:0;font-size:12px;color:#cbd5e1;line-height:1.7">
            <li>· < 50% delivery 2 quarters running</li>
            <li>· Compliance failure · audit qualified</li>
            <li>· MIS-field mismatch persistent</li>
            <li>· Trust collapse · governance breach</li>
          </ul>
        </div>
      </div></div>`],
};

await applyBatch([ZR, GP, GP_R, PM, PM_EX]);
