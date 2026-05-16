// Batch 3: scheme-linkage-drive + seeding-programme (2 decks)
// Run: node --env-file=/tmp/.env.app.pulled scripts/author-decks/03-drives-seeding.mjs
import { applyBatch, whySlide } from '../_inject-deck.mjs';

// ─── Scheme Linkage Drive ────────────────────────────────────────────────────
const SLD = {
  slug: 'scheme-linkage-drive',
  newSlide2Html: whySlide(
    `Every household leaves ₹X of entitlements unclaimed every year. We close that gap, household by household.`,
    `The drive is a 3-month campaign mode of the welfare rights programme. Door-to-door, document-first, scheme-by-scheme. We measure in numbers enrolled, not households visited.`,
    [
      [`Documents first`,`Aadhaar · income certificate · ration card · Jan Dhan. Without these four, no other scheme application moves. The drive starts with rectifying these in every household.`],
      [`8 schemes`,`CMCHIS / PMJAY · PMJJBY · PMSBY · APY · widow / old-age pension · PMAY · voter ID add. Each has its own form, evidence, queue. We batch.`],
      [`Cohort batching`,`Pick one scheme · enrol 50–100 households together · run the queue together at the govt office · faster + safer for first-time visitors than 1-at-a-time`],
      [`Close-loop`,`Application submitted is not the metric. Document or benefit received by household is the metric. Track every application end-to-end.`],
    ],
    `Most welfare-rights work fails at the close-loop step. We track applications until the benefit is in the family's hand — or we know why it isn't.`,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_sld1">
      <div class="label" style="color:#34d399">DRIVE FLOW</div>
      <h2 class="title">Linelist → document rectify → scheme cohort → close-loop</h2>
      <h3 class="sub">Each stage gates the next. Don't run scheme cohorts before documents are in.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;max-width:1180px">
        ${[
          [`📋`,`Line-list`,`Door-to-door · all households in target cluster · current entitlement status per HH · 1 row per household`,`#fbbf24`],
          [`🆔`,`Document rectify`,`Aadhaar updates · income certificate · ration card add-name · Jan Dhan account · weekly govt office camps`,`#34d399`],
          [`👥`,`Scheme cohort`,`Pick one scheme · batch 50–100 eligible HHs · forms filled together · submit together · CO accompanies`,`#38bdf8`],
          [`✅`,`Close-loop`,`Track each application until benefit / document received · escalate stuck cases · MIS update per HH`,`#c084fc`],
        ].map(([icon,name,what,color],i,arr)=>`
          <div style="position:relative;padding:20px 16px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:12px">
            <div style="font-size:30px;margin-bottom:8px;text-align:center">${icon}</div>
            <div style="font-size:14px;font-weight:700;color:${color};text-align:center">${name}</div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:8px;line-height:1.55">${what}</div>
            ${i<arr.length-1?`<div style="position:absolute;top:50%;right:-12px;transform:translateY(-50%);font-size:18px;color:${color};z-index:2">→</div>`:''}
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-amber" id="sX_sld2">
      <div class="label" style="color:#fbbf24">8-SCHEME MENU</div>
      <h2 class="title">What we drive · why each matters · what household needs</h2>
      <div style="margin-top:28px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:1180px">
        ${[
          [`CMCHIS / PMJAY`,`Health insurance up to ₹5 lakh / family / year. Govt + private hospitals. Most critical for catastrophic medical events.`,`#fb7185`],
          [`PMJJBY`,`Life insurance ₹2 lakh · ₹436/yr · auto-debit from Jan Dhan. The cheapest most-impactful enrolment we do.`,`#34d399`],
          [`PMSBY`,`Accident insurance ₹2 lakh · ₹20/yr · same auto-debit. Bundle with PMJJBY in one Jan Dhan visit.`,`#38bdf8`],
          [`APY`,`Atal Pension Yojana · monthly ₹1K–5K post-60 · subsidised premium · for unorganised-sector workers (most slum HHs)`,`#fbbf24`],
          [`Widow / OA pension`,`State-specific monthly stipend · widow + old-age + disability · documentation-heavy but recurring lifeline`,`#c084fc`],
          [`PMAY (Urban)`,`Housing subsidy · in-situ rehab · slum redevelopment · contested politically, slow but transformative when it lands`,`#a78bfa`],
          [`Voter ID add`,`Single biggest civic agency unlock · means ward councillor must respond · linked to all other documents`,`#5eead4`],
          [`Scholarships`,`Pre-matric / post-matric · OBC / SC / ST / minority · keeps kids in school · per-year application cycle`,`#fbbf24`],
        ].map(([s,what,color])=>`
          <div style="padding:14px 18px;background:rgba(255,255,255,.04);border-left:3px solid ${color};border-radius:8px">
            <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:4px">${s}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.55">${what}</div>
          </div>`).join('')}
      </div></div>`],
};

// ─── Seeding Programme ───────────────────────────────────────────────────────
const SEED = {
  slug: 'seeding-programme',
  newSlide2Html: whySlide(
    `Most civil-society gaps in our geographies are not solved by funding — they are solved by founding`,
    `The seeding programme finds, screens, supports and places founders who can build the next generation of NGOs in under-served geographies. We are the venture-builder for the social sector.`,
    [
      [`Geo demand first`,`Don't seed where there's already saturation. We map under-served geographies (cluster + theme) and source founders for those gaps specifically.`],
      [`Source + screen`,`Build a pipeline of 50–100 founder candidates per cycle · screen ruthlessly for fit · only 5–10 progress to cohort. Quality of founders is everything.`],
      [`Cohort placement`,`Selected founders go through structured handholding · placed with peer mentors · seed funding · 18-month accompaniment`,],
      [`Peer learning`,`We learn from existing seeding institutions (UnLtd · Acumen · BHRC) before designing the cohort. Don't reinvent.`],
    ],
    `The hardest part is screening — distinguishing a real founder from a polished applicant. The frame: would I deploy ₹50 L of risk capital on this person? If not, don't seed.`,
  ),
  diagramSlides: [`
<div class="slide bg-indigo" id="sX_sd1">
      <div class="label" style="color:#a78bfa">THE FUNNEL</div>
      <h2 class="title">From 100 prospects to a placed cohort</h2>
      <h3 class="sub">Tight at the top, ruthless in the middle, generous in support after placement.</h3>
      <div style="margin-top:32px;max-width:1100px;margin-left:auto;margin-right:auto">
        ${[
          [`100 prospects`,`Open applications · CSO referrals · cohorts from MBA/policy schools · self-nominated founders`,`100%`,`#fbbf24`],
          [`40 first-round`,`Application + written task + screening call · founder story + theory of change + grit signal`,`40%`,`#34d399`],
          [`20 deep-screen`,`In-person panel · domain test · peer reference · field-visit assessment · co-founder check`,`20%`,`#38bdf8`],
          [`10 cohort`,`Final cohort · 18-month accompaniment · seed funding · peer mentor · placement support`,`10%`,`#c084fc`],
          [`6–7 active at year 2`,`Realistic survival rate · 30% founder churn is normal · those who survive often become regional anchors`,`6–7%`,`#fb7185`],
        ].map(([stage,what,pct,color],i,arr)=>{
          const widths = ['100%','75%','55%','35%','25%'];
          return `
            <div style="display:flex;justify-content:center;margin-bottom:8px">
              <div style="width:${widths[i]};padding:14px 20px;background:rgba(255,255,255,.05);border:1px solid ${color}50;border-radius:10px;display:flex;align-items:center;gap:14px">
                <div style="font-size:18px;font-weight:700;color:${color};min-width:140px">${stage}</div>
                <div style="font-size:11px;color:#cbd5e1;line-height:1.45;flex:1">${what}</div>
                <div style="font-size:14px;font-weight:700;color:${color}">${pct}</div>
              </div>
            </div>`;
        }).join('')}
      </div></div>`,`
<div class="slide bg-violet" id="sX_sd2">
      <div class="label" style="color:#c084fc">SCREENING SIGNALS</div>
      <h2 class="title">What we look for · what we discount</h2>
      <div style="margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:1100px">
        <div style="padding:24px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#34d399;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Strong signals</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.85">
            <li>· Founder has lived the problem (not just observed it)</li>
            <li>· 6+ months of unpaid work already shipped</li>
            <li>· Field references from beneficiaries directly</li>
            <li>· Concrete theory of change, not aspirational</li>
            <li>· Co-founder commitment (loneliness kills founders)</li>
            <li>· Past failure they can talk about clearly</li>
            <li>· Comfort with operational detail (financials, MIS)</li>
          </ul>
        </div>
        <div style="padding:24px;background:rgba(251,113,133,.08);border:1px solid rgba(251,113,133,.3);border-radius:14px">
          <div style="font-size:13px;font-weight:700;color:#fb7185;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Discount these</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.85">
            <li>· Polished pitch · vague execution plan</li>
            <li>· "I want to start an NGO" — wrong frame</li>
            <li>· Solo founder allergic to operations</li>
            <li>· Asks about salary in first conversation</li>
            <li>· Cannot name one beneficiary</li>
            <li>· Confuses awareness with intervention</li>
            <li>· Treats funder pipeline as the strategy</li>
          </ul>
        </div>
      </div>
      <p class="body" style="margin-top:18px;font-size:13px;color:#ddd6fe;font-style:italic;max-width:1100px">Our seeding decision is essentially a venture decision with a 10-year horizon and no exit. Treat screening with that gravity.</p></div>`],
};

await applyBatch([SLD, SEED]);
