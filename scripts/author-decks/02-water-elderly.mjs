// Batch 2: water + elderly + remaining "existing" decks (8 total)
// Run: node --env-file=/tmp/.env.app.pulled scripts/author-decks/02-water-elderly.mjs
import { applyBatch, whySlide } from '../_inject-deck.mjs';

// ─── Water ATM / RO Plant ────────────────────────────────────────────────────
const WATER = {
  slug: 'water-atm',
  newSlide2Html: whySlide(
    `A 20-litre can sold for ₹35 — costs us less than ₹5 to produce safely`,
    `Slum households pay 7–10× the actual cost of clean water to private cans because there is no municipal alternative. The RO plant + ATM model breaks that price.`,
    [
      [`500–3,500 mg/L`, `Groundwater TDS in Bangalore slums. Above 500 mg/L the NGT permits RO; below it forbids RO. Coastal Chennai sees 2,000–5,000 mg/L from seawater intrusion.`],
      [`₹35 → ₹4`, `Private 20-litre can: ₹30–40. Our plant tariff: ₹4 per 20 L (₹0.20/litre). For a household using 20 L/day, that is ₹200/month saved.`],
      [`50–65% recovery`, `For every 1 litre of purified water, 0.4–1 litre is discharged as brine. Plan reject disposal upstream — never release into the same aquifer you draw from.`],
      [`RFID + IoT`, `Card-swipe dispense, cloud dashboard of litres + revenue + machine health. Sarvajal's Soochak model. Audit trail = no operator pilferage.`],
    ],
    `The plant works because the water is genuinely cheaper, the kiosk is closer than the can-seller, and the card means no haggling. Take any of those away and adoption stalls.`,
  ),
  diagramSlides: [`
<div class="slide bg-sky" id="sX_w1">
      <div class="label" style="color:#38bdf8">RO TREATMENT TRAIN</div>
      <h2 class="title">Eight stages between borewell and a 20-litre can</h2>
      <h3 class="sub">Skip a pre-filter and the membrane dies in 6 months instead of 18.</h3>
      <div style="margin-top:28px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;max-width:1180px">
        ${[
          [`💧`,`Raw water tank`,`5,000–10,000 L buffer · evens out intermittent borewell or tanker supply`,`#38bdf8`],
          [`🧱`,`Pressure sand filter`,`Removes turbidity, suspended solids · backwash every 6 hrs`,`#94a3b8`],
          [`⚫`,`Activated carbon`,`Removes chlorine, odour, organics · protects membrane`,`#a3a3a3`],
          [`🧴`,`Antiscalant dose`,`Critical in Bangalore high-silica · prevents membrane scaling`,`#fbbf24`],
          [`🔬`,`5-micron cartridge`,`Final barrier before membrane · replace every 1–3 months`,`#fbbf24`],
          [`🛡`,`RO membrane`,`4040 or 8040 element · sized for source TDS · the heart of the plant`,`#5eead4`],
          [`☀️`,`UV steriliser`,`Kills residual microbes · replace lamp every 8,000 hrs (~1 yr)`,`#c084fc`],
          [`💧`,`Product tank + TDS controller`,`Blends to 100–200 mg/L · ideal taste + health · then to ATM`,`#34d399`],
        ].map(([icon,name,what,color])=>`
          <div style="padding:14px 12px;background:rgba(255,255,255,.04);border:1px solid ${color}40;border-radius:10px">
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><div style="font-size:18px">${icon}</div><div style="font-size:12px;font-weight:700;color:${color}">${name}</div></div>
            <div style="font-size:10px;color:#cbd5e1;line-height:1.45">${what}</div>
          </div>`).join('')}
      </div>
      <div style="margin-top:18px;padding:16px 22px;background:rgba(251,113,133,.08);border-left:3px solid #fb7185;border-radius:8px;max-width:1180px">
        <div style="font-size:13px;color:#fda4af"><span style="font-weight:700">Brine warning:</span> the reject line has 1.5–2.5× the feed TDS. In Bangalore that means 3,000–5,000 mg/L brine. Discharge to municipal drain, gardening (non-food), or evaporation pond — never back into the source aquifer.</div>
      </div></div>`,`
<div class="slide bg-violet" id="sX_w2">
      <div class="label" style="color:#c084fc">PLANT-ROOM ECONOMICS</div>
      <h2 class="title">A 1,000 LPH plant for 500 households — cash-positive from month 1 if capex is grant-funded</h2>
      <h3 class="sub">Six numbers tell the story.</h3>
      <div style="margin-top:28px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px">
        ${[
          [`₹10–15 L`,`All-in capex (plant + ATM + civil + tanks). SBM / CSR typically covers this.`,`#fbbf24`],
          [`₹15–35 K`,`Monthly opex (operator salary 50% · electricity 30% · consumables + membrane amortised).`,`#fb7185`],
          [`6,000 L/day`,`Throughput at 60% adoption · 1,000 LPH × 8 hrs · ≈ 300 households at 20 L each.`,`#5eead4`],
          [`₹0.20/L`,`Sell price · ₹4 per 20-litre can · 7× cheaper than private can market.`,`#34d399`],
          [`₹2.7 L/mo`,`Gross revenue at 4,500 L/day × ₹0.20 — comfortably above opex even at low adoption.`,`#c084fc`],
          [`6–10 mo`,`Capex payback if you treat capex as recoverable. Most NGOs treat it as grant-funded sunk.`,`#a78bfa`],
        ].map(([num,what,color])=>`
          <div style="padding:18px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:12px">
            <div style="font-size:26px;font-weight:800;color:${color};line-height:1">${num}</div>
            <div style="font-size:12px;color:#cbd5e1;margin-top:8px;line-height:1.55">${what}</div>
          </div>`).join('')}
      </div></div>`],
};

// ─── Water ATM Existing ──────────────────────────────────────────────────────
const WATER_EX = {
  slug: 'water-atm-existing',
  newSlide2Html: whySlide(
    `RO plants fail silently. Monthly check is the only honest signal.`,
    `Membrane fouling, UV lamp failure, meter fraud, or borewell depletion all degrade over weeks — invisible from the cash register, fatal to the unit.`,
    [
      [`>15% flux drop`,`Membrane fouling signature. Initiate CIP chemical clean immediately. Replace if CIP doesn't restore flow.`],
      [`8,000 hrs`,`UV lamp life. ~1 year. Replace annually whether or not it looks fine — germicidal efficacy is not visible.`],
      [`Revenue / litre`,`Cross-check: cloud-dashboard litres dispensed × tariff vs cash + UPI collected. Divergence > 5% triggers operator audit.`],
      [`Borewell yield`,`Log water level weekly. Bangalore aquifers depleting fast — a working borewell can fail in 18 months. Have a tanker MoU ready.`],
    ],
    `One plant operator manages 2–3 plants. The monthly visit is what makes the model honest.`,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_wex1">
      <div class="label" style="color:#34d399">MONTHLY MAINTENANCE CYCLE</div>
      <h2 class="title">Seven checks · 90 minutes per plant · no shortcuts</h2>
      <div style="margin-top:28px;display:grid;gap:8px;max-width:1100px">
        ${[
          [`1`,`Product TDS reading vs target (100–200 mg/L)`,`#34d399`],
          [`2`,`Membrane flux test — measure permeate flow at design pressure`,`#5eead4`],
          [`3`,`UV lamp hour-counter check + replace if > 8,000 hrs`,`#38bdf8`],
          [`4`,`Pre-filter cartridge inspection — replace if visibly fouled`,`#fbbf24`],
          [`5`,`Borewell water level + flow rate log`,`#c084fc`],
          [`6`,`Dashboard reconciliation: litres dispensed × tariff vs cash + RFID + UPI`,`#a78bfa`],
          [`7`,`Brine disposal pipe condition check · CMC + community walk-through`,`#fb7185`],
        ].map(([n,what,color])=>`
          <div style="display:grid;grid-template-columns:50px 1fr;gap:14px;padding:10px 16px;background:rgba(255,255,255,.04);border-left:3px solid ${color};border-radius:8px;align-items:center">
            <div style="font-size:18px;font-weight:800;color:${color};text-align:center">${n}</div>
            <div style="font-size:13px;color:#cbd5e1">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-amber" id="sX_wex2">
      <div class="label" style="color:#fbbf24">MEMBRANE LIFE CURVE</div>
      <h2 class="title">In Bangalore high-silica water, membranes die in 6–12 months — not the textbook 2–3 years</h2>
      <h3 class="sub">Plan replacement into opex from day one. Surprise membrane swaps are the leading cause of multi-week downtime.</h3>
      <div style="margin-top:32px;padding:32px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.25);border-radius:14px;max-width:1100px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px">
          ${[
            [`Month 1`,`100% flux`,`Honeymoon — new membrane operating at design`,`#34d399`],
            [`Month 4`,`90% flux`,`Mild fouling · first CIP chemical clean restores ~95%`,`#5eead4`],
            [`Month 8`,`75% flux`,`Bangalore silica scaling visible · second CIP marginal · plan replacement budget`,`#fbbf24`],
            [`Month 10–12`,`<70% flux`,`Replace. Don't wait for total failure — ATM tariff drops if recovery falls.`,`#fb7185`],
          ].map(([when,flux,what,color])=>`
            <div style="padding:14px;background:rgba(0,0,0,.2);border-top:3px solid ${color};border-radius:8px">
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">${when}</div>
              <div style="font-size:18px;font-weight:800;color:${color};margin-top:4px">${flux}</div>
              <div style="font-size:11px;color:#cbd5e1;margin-top:6px;line-height:1.5">${what}</div>
            </div>`).join('')}
        </div>
      </div></div>`],
};

// ─── Elderly Kitchen ─────────────────────────────────────────────────────────
const KITCHEN = {
  slug: 'elderly-kitchen',
  newSlide2Html: whySlide(
    `Most slum elderly skip one meal a day — sometimes both`,
    `Pension is delayed, family migrated, body too weak to cook on a kerosene stove. The Elderly Community Kitchen puts one trusted woman in charge of feeding 15 elderly daily — fixed menu, hot meal, ₹0 at the point of need.`,
    [
      [`15 elderly`,`per kitchen — small enough that one woman cooks at home, large enough to matter. We don't centralise into industrial kitchens. The trust travels with the woman.`],
      [`6 days/week`,`one hot midday meal: rice + vegetable side dish + ragi mudde + boiled egg. The menu is fixed so quality is checkable.`],
      [`₹X / meal`,`Direct cost · grocery + vegetable + egg + gas + woman's stipend ÷ 15 × 6. Compare to community-langar economics; this is per-elderly per-day.`],
      [`Bed-ridden delivery`,`The most vulnerable get a lunchbox at home from the CO. That one delivery per day is often the only check on whether they are alive.`],
    ],
    `Pick the kitchen woman wrong and the programme collapses by month 3. The Selection pitstop is where everything is won or lost — the cooking is the easy part.`,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_k1">
      <div class="label" style="color:#34d399">A DAY IN A KITCHEN</div>
      <h2 class="title">8 hours · 15 plates · 1 woman · 1 CO</h2>
      <h3 class="sub">The kitchen woman is the operator; the CO is the audit. Mid-day visit is the heartbeat.</h3>
      <div style="margin-top:28px;display:grid;gap:8px;max-width:1080px">
        ${[
          [`7:30 AM`,`Kitchen woman receives vegetable delivery from CO (every 3rd day)`,`#fbbf24`],
          [`8:30 AM`,`Cooks rice, dal, vegetable, ragi mudde for 15. Boils eggs separately.`,`#fb7185`],
          [`11:00 AM`,`Elderly arrive — sit, eat, take medication if any. Kitchen woman serves.`,`#34d399`],
          [`11:30 AM`,`CO present for 30 min · spot-checks portion sizes · listens for complaints · marks attendance in MIS`,`#38bdf8`],
          [`12:00 PM`,`Bed-ridden lunchbox packed · CO carries to home · note any concern`,`#c084fc`],
          [`12:30 PM`,`Kitchen woman cleans · enters inventory used in register · stove off`,`#a78bfa`],
          [`Weekly`,`RP joins one kitchen rotation per week · samples meal · talks to one elderly · tastes the dal`,`#fb7185`],
        ].map(([t,what,color])=>`
          <div style="display:grid;grid-template-columns:90px 1fr;gap:14px;padding:10px 16px;background:rgba(255,255,255,.04);border-left:3px solid ${color};border-radius:8px;align-items:center">
            <div style="font-size:13px;font-weight:700;color:${color}">${t}</div>
            <div style="font-size:13px;color:#cbd5e1;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-amber" id="sX_k2">
      <div class="label" style="color:#fbbf24">PROCUREMENT RHYTHM</div>
      <h2 class="title">Monthly grocery + 3-day vegetable — separated for a reason</h2>
      <h3 class="sub">Two parallel supply chains keep quality fresh and corruption hard.</h3>
      <div style="margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1100px">
        <div style="padding:24px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#fbbf24;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Monthly grocery</div>
          <div style="font-size:13px;color:#cbd5e1;line-height:1.7"><strong>What:</strong> rice · dal · oil · jaggery · eggs · ragi flour · salt · masala<br/><strong>Where:</strong> vetted monthly vendor · invoice to partner accounts<br/><strong>Store:</strong> resource centre, locked, register kept by CO<br/><strong>Why monthly:</strong> bulk pricing · less petty cash movement · single audit point</div>
        </div>
        <div style="padding:24px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#34d399;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">3-day vegetable</div>
          <div style="font-size:13px;color:#cbd5e1;line-height:1.7"><strong>What:</strong> seasonal vegetables · greens · onion · potato<br/><strong>Where:</strong> vetted veg vendor · payment NOT through kitchen woman<br/><strong>Delivery:</strong> CO collects every 3rd day and delivers · checks weight + quality<br/><strong>Why short cycle:</strong> freshness · veg can't be hoarded · daily corruption opportunity removed</div>
        </div>
      </div>
      <p class="body" style="margin-top:18px;font-size:13px;color:#fcd34d;font-style:italic;max-width:1100px">Cash never sits with the kitchen woman. Stipend paid monthly via bank transfer. Vendors paid by partner accounts. This is what kept the model honest at scale.</p></div>`],
};

// ─── Elderly Kitchen Existing ────────────────────────────────────────────────
const KITCHEN_EX = {
  slug: 'elderly-kitchen-existing',
  newSlide2Html: whySlide(
    `Kitchen quality slips one ingredient at a time`,
    `Skipped egg, halved dal, watered curry. By the time elderly complain, the woman has been cutting corners for 3 weeks. The CO's mid-day taste-test is the only honest catch.`,
    [
      [`Mid-day taste`,`CO tastes the dal every visit. Not a sample portion — the actual dal in the pot. Logs taste in MIS. Two weak dals in a row = RP escalates.`],
      [`Portion check`,`Weigh the rice on the plate of 1 random elderly. Underweight by 20% = same conversation. Don't accept "but I cooked more for [X]" — fixed menu means fixed portion.`],
      [`Inventory match`,`Register grocery used vs received. If 5 kg dal was issued and 3 kg is unaccounted for after 6 days, that's not a math problem — that's a quiet sale.`],
      [`Elderly check-in`,`One enrolled elderly interviewed every visit. "When was the last egg?" "Was there ragi mudde Wednesday?" Their answer beats any register.`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-sky" id="sX_kex1">
      <div class="label" style="color:#38bdf8">MONTHLY CHECK</div>
      <h2 class="title">Six checks that catch the silent slide</h2>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px">
        ${[
          [`🍲`,`Mid-day dal taste`,`Taste the actual pot · not a saucer · log strength + taste in MIS · two weak ones = RP escalates`,`#fbbf24`],
          [`⚖️`,`Portion weight spot-check`,`Weigh rice on 1 random plate · fixed-menu portion is non-negotiable · under = conversation`,`#34d399`],
          [`📒`,`Inventory reconciliation`,`Grocery received vs used in register · 20%+ gap = audit + counsel`,`#fb7185`],
          [`🥚`,`Egg count match`,`Eggs issued vs served · the easiest item to drop · log per kitchen daily`,`#c084fc`],
          [`👂`,`Elderly interview`,`Pick one elderly · ask about last 7 days · their memory is the ground truth`,`#5eead4`],
          [`🚪`,`Bed-ridden visit`,`CO delivers lunchbox + spends 10 min · welfare check is the real value here`,`#a78bfa`],
        ].map(([icon,what,how,color])=>`
          <div style="padding:16px;background:rgba(255,255,255,.04);border:1px solid ${color}40;border-radius:10px">
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><div style="font-size:22px">${icon}</div><div style="font-size:13px;font-weight:700;color:${color}">${what}</div></div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.55">${how}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-violet" id="sX_kex2">
      <div class="label" style="color:#c084fc">QUALITY RED FLAGS</div>
      <h2 class="title">When to keep coaching · when to replace the kitchen woman</h2>
      <h3 class="sub">Coaching is the default. Replacement is the last resort. But waiting too long destroys the kitchen.</h3>
      <div style="margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1100px">
        <div style="padding:24px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#34d399;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Coach · don't replace</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.85">
            <li>· One-off weak dal · weather or health</li>
            <li>· Inventory off by &lt; 10% in a month</li>
            <li>· One missed cook day with clear reason</li>
            <li>· Complaints from 1 elderly, none from others</li>
            <li>· Kitchen woman flags her own issue early</li>
          </ul>
        </div>
        <div style="padding:24px;background:rgba(251,113,133,.08);border:1px solid rgba(251,113,133,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#fb7185;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Escalate to replacement</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.85">
            <li>· Repeated underweight portions despite coaching</li>
            <li>· Inventory gaps &gt; 20% two months running</li>
            <li>· Multiple elderly independently flag quality</li>
            <li>· Vendor coordination breaks (refuses CO)</li>
            <li>· Trust loss in the wider community</li>
          </ul>
        </div>
      </div></div>`],
};

// ─── Elderly Centre ──────────────────────────────────────────────────────────
const E_CENTRE = {
  slug: 'elderly-centre',
  newSlide2Html: whySlide(
    `Slum elderly aren't dying of one disease — they're dying of loneliness, missed pension, untreated hypertension, and no one noticing they fell`,
    `The programme runs four parallel models — categorisation + home visits + day care + palliative — because no single intervention covers the range.`,
    [
      [`Independent`,`Mobile, social, mainly need scheme linkage (pension, ration, Ayushman) and a peer forum. Light-touch.`],
      [`Frail`,`Mobility limited, alone for hours, chronic conditions. Weekly CO home visit · BP/sugar check · medication compliance.`],
      [`Bedridden`,`Confined to home, depends on family or none. Daily home visit · meal delivery · hygiene check · dignity care.`],
      [`Palliative`,`End-of-life. Pain management · family counselling · linked to govt palliative service · the most demanding category.`],
    ],
    `Field workers are trained to categorise on first visit and re-categorise quarterly. Wrong category = wrong intervention = wasted visit.`,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_ec1">
      <div class="label" style="color:#34d399">FOUR-CATEGORY MODEL</div>
      <h2 class="title">Each elderly gets one of four cards</h2>
      <h3 class="sub">Visit cadence, intervention type, MIS tracking — all flow from the category.</h3>
      <div style="margin-top:28px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;max-width:1180px">
        ${[
          [`🚶`,`Independent`,`Weekly forum · monthly group activity · scheme linkage as needed · the lightest touch`,`#34d399`,`Monthly visit`],
          [`🧓`,`Frail`,`Weekly CO home visit · BP + sugar log · meds reminder · referral when needed`,`#fbbf24`,`Weekly visit`],
          [`🛏`,`Bedridden`,`Daily home visit · hot meal delivery · hygiene assist · family rotation`,`#fb7185`,`Daily visit`],
          [`🕯`,`Palliative`,`Pain mgmt · family counselling · govt palliative team link · dignity in last weeks`,`#c084fc`,`Daily / on-call`],
        ].map(([icon,cat,what,color,cadence])=>`
          <div style="padding:20px 14px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:12px">
            <div style="text-align:center;font-size:36px;margin-bottom:10px">${icon}</div>
            <div style="text-align:center;font-size:14px;font-weight:700;color:${color}">${cat}</div>
            <div style="text-align:center;font-size:10px;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;margin-top:4px">${cadence}</div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:10px;line-height:1.55">${what}</div>
          </div>`).join('')}
      </div>
      <div style="margin-top:20px;padding:16px 22px;background:rgba(196,132,252,.08);border:1px solid rgba(196,132,252,.3);border-radius:10px;max-width:1180px">
        <p class="body" style="font-size:13px"><span style="color:#c084fc;font-weight:700">Re-categorise quarterly.</span> An Independent elderly who falls becomes Frail. A Frail who develops cancer enters Palliative. Stale categories produce stale visits.</p>
      </div></div>`,`
<div class="slide bg-indigo" id="sX_ec2">
      <div class="label" style="color:#a78bfa">CENTRE + OUTREACH</div>
      <h2 class="title">Day care centre by day · outreach team into homes parallel</h2>
      <h3 class="sub">The centre is where the Independent and Frail elderly congregate. The outreach team carries the centre to the Bedridden and Palliative.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:1100px">
        <div style="padding:24px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#a78bfa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Day care centre</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.85">
            <li>· Open 10 AM – 4 PM, 6 days/week</li>
            <li>· Hot mid-day meal (cross-subsidy with kitchen)</li>
            <li>· Physiotherapy exercises · group games</li>
            <li>· BP / sugar clinic weekly · doctor referral monthly</li>
            <li>· Festival meals · birthday recognition</li>
            <li>· Peer forum + grievance redressal</li>
          </ul>
        </div>
        <div style="padding:24px;background:rgba(94,234,212,.08);border:1px solid rgba(94,234,212,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#5eead4;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Outreach team</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.85">
            <li>· Daily home visit roster (Bedridden + Palliative)</li>
            <li>· Carry meal · check vitals · turn-and-clean assist</li>
            <li>· Refill medicine · liaise with family</li>
            <li>· Refer crises to centre doctor + govt palliative</li>
            <li>· Log each visit in MIS (photo + voice note)</li>
            <li>· Death-and-dignity protocol when the time comes</li>
          </ul>
        </div>
      </div></div>`],
};

// ─── Elderly Centre Existing ─────────────────────────────────────────────────
const E_CENTRE_EX = {
  slug: 'elderly-centre-existing',
  newSlide2Html: whySlide(
    `Re-categorisation + referral close-loop are what stop the programme drifting`,
    `Elderly conditions change fast. Without quarterly re-categorisation, your daily-visit roster gets disconnected from who actually needs daily visits.`,
    [
      [`Quarterly re-cat`,`Every enrolled elderly re-categorised every 3 months. The Bedridden list this quarter looks different from last quarter.`],
      [`Referral loop`,`When CO refers an elderly to a govt hospital or palliative team, the loop must close — did the referral happen? With what outcome? Lost referrals = lost trust.`],
      [`Home-visit MIS`,`Photo + voice note per visit. ZL monthly review checks 10 random entries. Missing entries = visits not happening.`],
      [`Forum activity`,`Independent elderly forum is the early-warning sensor. Attendance drop = something wrong in the community we haven't caught yet.`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-sky" id="sX_ecex1">
      <div class="label" style="color:#38bdf8">MONTHLY OPS REVIEW</div>
      <h2 class="title">Five tabs in the monthly dashboard</h2>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;max-width:1180px">
        ${[
          [`Categorisation`,`Total elderly · split across 4 categories · change vs last month`,`#34d399`],
          [`Home visits`,`Visits scheduled vs completed · % completion per CO · missed visits flagged`,`#38bdf8`],
          [`Referrals`,`Open referrals · closed this month · avg days to close · outcomes`,`#c084fc`],
          [`Health metrics`,`BP / sugar trend per elderly · medication compliance · new diagnoses`,`#fb7185`],
          [`Forum + centre`,`Daily attendance trend · new enrolments · drop-outs · feedback`,`#fbbf24`],
        ].map(([t,what,color])=>`
          <div style="padding:16px 12px;background:rgba(255,255,255,.05);border-top:3px solid ${color};border-radius:8px;min-height:140px">
            <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:8px">${t}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.6">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-violet" id="sX_ecex2">
      <div class="label" style="color:#c084fc">REFERRAL PATHWAY</div>
      <h2 class="title">Every referral has a closing entry — or it didn't happen</h2>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;max-width:1180px">
        ${[
          [`Identify`,`CO flags need on home visit · category + urgency`,`#fbbf24`],
          [`Refer`,`Refer to specific destination — name, number, address. Vague referrals fail.`,`#34d399`],
          [`Accompany`,`First-time referral: CO accompanies. Govt offices are intimidating; elderly alone get bounced.`,`#38bdf8`],
          [`Close loop`,`Did the elderly receive what was promised? Log outcome + next action. No loose ends.`,`#c084fc`],
        ].map(([step,what,color],i,arr)=>`
          <div style="position:relative;padding:18px 14px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:10px">
            <div style="font-size:14px;font-weight:700;color:${color};margin-bottom:6px">${step}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.55">${what}</div>
            ${i<arr.length-1?`<div style="position:absolute;top:50%;right:-10px;transform:translateY(-50%);font-size:18px;color:${color};z-index:2">→</div>`:''}
          </div>`).join('')}
      </div></div>`],
};

// ─── Creche Existing ─────────────────────────────────────────────────────────
const CRECHE_EX = {
  slug: 'creche-program-existing',
  newSlide2Html: whySlide(
    `A creche is only as good as its monthly check-in with mothers`,
    `Mothers are the early-warning system. They see what we miss — a tired caregiver, a sick child, a quietly leaving family.`,
    [
      [`Growth monitoring`,`Monthly weight + height for every child. A child slipping 2 percentile points two months running is acted on, not noted.`],
      [`Caregiver supervision`,`Monthly 1:1 between caregiver and supervisor · pick 1 child to deep-dive · pick 1 practice to coach. Same loop as Welfare Rights' MAS practice.`],
      [`Mother engagement`,`Monthly mothers meet at the creche · 30 mins · what's working · what's broken · who's struggling. Attendance trend tells you trust trend.`],
      [`Health linkage`,`Anganwadi + govt PHC nurse comes to creche once a month · immunisation gaps caught here · easier than catching them at home`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_crex1">
      <div class="label" style="color:#34d399">MONTHLY GROWTH CHART</div>
      <h2 class="title">Every child's weight + height plotted on the WHO percentile chart</h2>
      <h3 class="sub">A 2-month slide is a malnutrition signal — act, don't wait.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px">
        ${[
          [`📊`,`Plot`,`Caregiver records weight + height monthly · plotted on age-percentile chart in creche register`,`#34d399`],
          [`🚨`,`Slide flag`,`2 consecutive months of decline = supervisor visit · third month = referral to anganwadi / PHC`,`#fb7185`],
          [`👩‍⚕`,`Linkage`,`Govt nurse visits creche monthly · re-weighs flagged children · suggests THR (take-home ration)`,`#38bdf8`],
        ].map(([icon,name,what,color])=>`
          <div style="padding:20px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:12px">
            <div style="font-size:32px;margin-bottom:10px">${icon}</div>
            <div style="font-size:14px;font-weight:700;color:${color}">${name}</div>
            <div style="font-size:12px;color:#cbd5e1;margin-top:8px;line-height:1.6">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-violet" id="sX_crex2">
      <div class="label" style="color:#c084fc">MOTHERS MEET RHYTHM</div>
      <h2 class="title">30 minutes a month — the most important meeting at the creche</h2>
      <div style="margin-top:32px;display:grid;gap:8px;max-width:1080px">
        ${[
          [`0–5 min`,`Welcome · attendance · last month's commitments check-in`,`#fbbf24`],
          [`5–15 min`,`Quick what-works / what-doesn't from mothers · supervisor only listens · no defending`,`#34d399`],
          [`15–25 min`,`Pick 1 issue to act on this month · CO + supervisor commit to next step · written on board`,`#38bdf8`],
          [`25–30 min`,`Festival / activity preview · birthday recognition · child star of the month`,`#c084fc`],
        ].map(([t,what,color])=>`
          <div style="display:grid;grid-template-columns:90px 1fr;gap:14px;padding:10px 16px;background:rgba(255,255,255,.04);border-left:3px solid ${color};border-radius:8px;align-items:center">
            <div style="font-size:13px;font-weight:700;color:${color}">${t}</div>
            <div style="font-size:13px;color:#cbd5e1;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div></div>`],
};

// ─── Community Toilet Existing ───────────────────────────────────────────────
const CT_EX = {
  slug: 'community-toilet-existing',
  newSlide2Html: whySlide(
    `Cleanliness rating drops in 60 days if no one is watching`,
    `Daily 3-shift cleaning is what holds the standard. Monthly community audit + dashboard reconciliation is what holds the operator honest.`,
    [
      [`3 cleaning shifts`,`Morning · afternoon · night · each ending with a wet-mop + soap restock. Skip one = smell = women stop coming = the complex dies.`],
      [`>10% revenue divergence`,`Litres dispensed × tariff ≠ cash + RFID + UPI collected. Open the books. Operator bypass usually shows up first as this gap.`],
      [`Quarterly NABL`,`Independent water lab test of RO product + greywater effluent. Done at a NABL-accredited lab, not the operator's own kit. Posted publicly.`],
      [`Monthly CMC mtg`,`Open to all users. CMC + operator + RP. 30–45 min. Minutes on the noticeboard. The peer accountability is the muscle.`],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_ctex1">
      <div class="label" style="color:#34d399">3-SHIFT DAILY CYCLE</div>
      <h2 class="title">What each shift does + signs the previous shift cut corners</h2>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px">
        ${[
          [`🌅`,`Morning 6 AM – 2 PM`,`Pre-peak deep clean · re-stock soap + paper · post yesterday's cleanliness score · attendant register signed`,`Wet floors at 9 AM = night shift skipped final mop`,`#fbbf24`],
          [`🌇`,`Afternoon 2 PM – 10 PM`,`Mid-day spot-clean cycles · empty trash · check water pressure · attend complaints log`,`Empty soap dispenser by 6 PM = morning didn't restock`,`#fb7185`],
          [`🌃`,`Night 10 PM – 6 AM`,`Final deep clean · machine + drain check · close-of-day reconciliation · safe handover`,`Smell at 7 AM = night didn't run drain check`,`#c084fc`],
        ].map(([icon,shift,what,redflag,color])=>`
          <div style="padding:20px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:12px">
            <div style="font-size:36px;text-align:center;margin-bottom:8px">${icon}</div>
            <div style="font-size:13px;font-weight:700;color:${color};text-align:center">${shift}</div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:10px;line-height:1.55">${what}</div>
            <div style="font-size:10px;color:#fda4af;margin-top:10px;line-height:1.5;font-style:italic">↑ ${redflag}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-violet" id="sX_ctex2">
      <div class="label" style="color:#c084fc">MONTHLY KPI WALL</div>
      <h2 class="title">Six numbers the community sees every month at the entrance board</h2>
      <h3 class="sub">Public dashboard = peer pressure on the operator. Don't hide the numbers.</h3>
      <div style="margin-top:28px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px">
        ${[
          [`Daily users`,`Avg footfall this month · trend vs last month · target ≥ 75% of catchment`,`#fbbf24`],
          [`Cleanliness ★`,`1–5 star avg from monthly CMC audit · posted with sub-scores (smell, soap, latches)`,`#34d399`],
          [`Female user share`,`≥ 40% of users female · drop = safety / privacy / lighting issue · investigate`,`#fb7185`],
          [`Revenue split`,`Toilet · bath · laundry · water · pass — share by service · trend monitoring`,`#38bdf8`],
          [`Complaints closed`,`Logged this month · closed within 24 hrs (minor) · 7 days (major)`,`#c084fc`],
          [`Water test pass`,`NABL test result vs IS standards · pass / fail with date · public copy`,`#5eead4`],
        ].map(([metric,what,color])=>`
          <div style="padding:18px;background:rgba(255,255,255,.05);border-left:3px solid ${color};border-radius:10px">
            <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:6px">${metric}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.55">${what}</div>
          </div>`).join('')}
      </div></div>`],
};

await applyBatch([WATER, WATER_EX, KITCHEN, KITCHEN_EX, E_CENTRE, E_CENTRE_EX, CRECHE_EX, CT_EX]);
