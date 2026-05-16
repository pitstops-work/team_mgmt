// Batch 1: Centre-based community programmes
//   children-learning-centre, children-learning-centre-existing,
//   youth-resource-centre, youth-resource-centre-existing
//
// Run: node --env-file=/tmp/.env.app.pulled scripts/author-decks/01-centres.mjs
import { applyBatch } from '../_inject-deck.mjs';

// ─── Shared whyBox helper for visual consistency ─────────────────────────────
const whyBox = (num, body) => `
  <div style="padding:20px 24px;background:rgba(251,113,133,.08);border-left:3px solid #fb7185;border-radius:10px">
    <div style="font-size:30px;font-weight:800;color:#fda4af">${num}</div>
    <p class="body" style="font-size:14px;margin-top:6px">${body}</p>
  </div>`;

const whySlide = (title, sub, boxes, closer) => `<div class="slide bg-rose" id="s2">
      <div class="label" style="color:#fb7185">WHY THIS GOAL MATTERS</div>
      <h2 class="title">${title}</h2>
      <h3 class="sub">${sub}</h3>
      <div style="margin-top:24px;display:grid;grid-template-columns:repeat(2,1fr);gap:16px;max-width:1080px">
        ${boxes.map(b => whyBox(b[0], b[1])).join('')}
      </div>
      ${closer ? `<p class="body" style="margin-top:24px;font-size:16px;color:#fecaca;font-style:italic;max-width:1080px">${closer}</p>` : ''}</div>`;

const diagramSlide = ({ bg, labelColor, label, title, sub, body }) => `
<div class="slide ${bg}" id="sX_${Math.random().toString(36).slice(2,7)}">
      <div class="label" style="color:${labelColor}">${label}</div>
      <h2 class="title">${title}</h2>
      <h3 class="sub">${sub}</h3>
      ${body}</div>`;

// ─── CLC: Children Learning Centre ───────────────────────────────────────────
const CLC = {
  slug: 'children-learning-centre',
  newSlide2Html: whySlide(
    'School enrolment is high. Learning is broken.',
    'A first-gen learner sits in a 50-child govt class with a teacher who has 4 grades to handle. The child cannot read their own textbook. CLCs catch this gap before it widens to dropout.',
    [
      ['~50 children', 'in a typical govt school class in our settlements — one teacher handling Std 1–5 in the same room. No remedial bandwidth for the child who fell behind in Std 1.'],
      ['Class 5 = Class 2', 'level: in our baseline ASER-style assessment, the majority of Std-5 children cannot read a Std-2 text or do single-digit division. The gap compounds each year.'],
      ['4–14 yrs', 'is the window we work in: Foundation (4–6, school-readiness), Bridge (7–10, basic literacy + numeracy), Senior (11–14, scholarships + life skills + mainstreaming).'],
      ['~25–30 per CLC', 'capped enrolment per centre, 2 trained teachers + 1 in-charge. Two hours daily after-school plus weekend enrichment.'],
    ],
    'The CLC is not a parallel school. It is a remedial bridge that returns the child to the govt school system, school-ready and confident, by the end of the cycle.',
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_clc1">
      <div class="label" style="color:#34d399">THE LEARNING LADDER</div>
      <h2 class="title">Four levels, one exit: mainstream the child back</h2>
      <h3 class="sub">Every child is placed at the right rung after baseline. The goal isn't to keep them with us forever — it's to graduate them.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;max-width:1180px">
        ${[
          ['🌱','Foundation','Ages 4–6 · school-readiness · play-based literacy + counting · age-appropriate motor skill · 1 hr/day','#fbbf24'],
          ['📖','Bridge','Ages 7–10 · phonics-based reading · basic arithmetic · concept clarity · 1.5 hrs/day · weekly assessment','#34d399'],
          ['🎯','Senior','Ages 11–14 · pre-matric scholarship coaching · life skills · STEM + English exposure · 2 hrs/day','#38bdf8'],
          ['🚀','Mainstreaming','Re-enrolled in govt school or RTE seat in private · CLC alumni network · scheme + scholarship follow-through','#c084fc'],
        ].map(([icon,name,what,color],i,arr)=>`
          <div style="position:relative;padding:20px 16px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:12px;text-align:center">
            <div style="font-size:32px;margin-bottom:8px">${icon}</div>
            <div style="font-size:14px;font-weight:700;color:${color}">${name}</div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:6px;line-height:1.55">${what}</div>
            ${i<arr.length-1?`<div style="position:absolute;top:50%;right:-12px;transform:translateY(-50%);font-size:18px;color:${color};z-index:2">→</div>`:''}
          </div>`).join('')}
      </div>
      <div style="margin-top:24px;padding:18px 24px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.3);border-radius:12px;max-width:1180px">
        <p class="body" style="font-size:13px;line-height:1.65"><span style="color:#34d399;font-weight:700">Baseline test, every January.</span> Every child re-assessed on reading + maths + concept clarity. We move them up a rung when ready, not by age. Mainstreaming happens when the child can hold their own in their govt class — verified by the govt teacher.</p>
      </div></div>`,`
<div class="slide bg-violet" id="sX_clc2">
      <div class="label" style="color:#c084fc">A WEEK AT THE CLC</div>
      <h2 class="title">Five teaching days + Saturday CAP review + Sunday enrichment</h2>
      <h3 class="sub">The weekly rhythm is what makes the centre feel like school, not tuition. Children learn the cadence too.</h3>
      <div style="margin-top:28px;display:grid;grid-template-columns:repeat(7,1fr);gap:8px;max-width:1180px">
        ${[
          ['Mon','Reading + phonics block · 1 worksheet','#fbbf24'],
          ['Tue','Maths block · concept demo + practice','#34d399'],
          ['Wed','Reading or maths · plus homework support','#38bdf8'],
          ['Thu','Library hour + life skills (hygiene, safety, money basics)','#c084fc'],
          ['Fri','Group activity + revision quiz · attendance award','#a78bfa'],
          ['Sat','CAP review with CO · weekly progress sheet · parent call','#fb7185'],
          ['Sun','Enrichment: art, sport, theatre, scheme camp (monthly)','#fbbf24'],
        ].map(([d,what,color])=>`
          <div style="padding:14px 10px;background:rgba(255,255,255,.05);border-top:3px solid ${color};border-radius:8px;min-height:120px">
            <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:6px">${d}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div>
      <p class="body" style="margin-top:18px;font-size:13px;color:#ddd6fe;font-style:italic;max-width:1180px">CAP = Capacity Action Plan. CO visits every Saturday, sits with the teacher, picks one child to deep-dive on, picks one teaching practice to improve. Same child, same practice tracked over 3 weeks before moving on.</p></div>`],
};

// ─── CLC Existing ────────────────────────────────────────────────────────────
const CLC_EX = {
  slug: 'children-learning-centre-existing',
  newSlide2Html: whySlide(
    'A CLC silently slides in 60 days if nobody is watching',
    'Attendance drops first, then teacher prep, then learning. The ongoing visit + monthly training cadence is what keeps the centre alive.',
    [
      ['Twice a week', 'minimum CO visit cadence per centre. Once-a-week is when teachers stop preparing seriously. The visit is the signal that someone cares.'],
      ['Monthly training', 'with all teachers in the cluster. Teaching technique focus changes each month — phonics, then number sense, then concept-of-print, then assessment practice.'],
      ['Govt school link', 'is the long-term insurance. Monthly meet with the govt school teacher of every enrolled child — what did they see? What gap should we focus on?'],
      ['DI / WCD calls', 'matter when a child is being pulled out, RTE entitlement contested, or a teacher needs official recognition. The relationship needs to exist before you need it.'],
    ],
    'A CLC that exists on the register but does not have these three rhythms running is not a CLC. It is rent on a room.',
  ),
  diagramSlides: [`
<div class="slide bg-sky" id="sX_clce1">
      <div class="label" style="color:#38bdf8">CO VISIT RHYTHM</div>
      <h2 class="title">Two visits a week per centre — and what each is for</h2>
      <h3 class="sub">Don't mix the two purposes. Treat each visit as its own checklist.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:1100px">
        <div style="padding:24px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.3);border-radius:12px">
          <div style="font-size:13px;font-weight:700;color:#38bdf8;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Mid-week visit</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.9">
            <li>· Sit in the classroom — observe ≥ 1 full block</li>
            <li>· Spot-check 3 children's notebooks for last week</li>
            <li>· Catch the one child who's becoming irregular</li>
            <li>· Re-stock TLM (teaching-learning material) if low</li>
            <li>· Quiet word with teacher about the spot-check</li>
          </ul>
        </div>
        <div style="padding:24px;background:rgba(196,132,252,.08);border:1px solid rgba(196,132,252,.3);border-radius:12px">
          <div style="font-size:13px;font-weight:700;color:#c084fc;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px">Saturday CAP visit</div>
          <ul style="list-style:none;padding:0;font-size:13px;color:#cbd5e1;line-height:1.9">
            <li>· Sit with teacher 30–45 min · structured CAP review</li>
            <li>· Pick 1 deep-dive child for next week</li>
            <li>· Pick 1 teaching practice to coach on</li>
            <li>· Carry the same focus into the next Saturday</li>
            <li>· Update the centre MIS — attendance, drop-outs, mainstreaming</li>
          </ul>
        </div>
      </div></div>`,`
<div class="slide bg-amber" id="sX_clce2">
      <div class="label" style="color:#fbbf24">MONTHLY TRAINING</div>
      <h2 class="title">One technique, one month — drilled in until the teacher owns it</h2>
      <h3 class="sub">Don't sprinkle topics. Pick one method per month for the whole cluster. Coach to it every visit.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;max-width:1180px">
        ${[
          ['Phonics',`Sound-letter mapping → blending → fluency. Bad: "A for apple". Good: "a-p-p → app". Used daily in Foundation + Bridge.`,'#fbbf24'],
          ['Number sense','Concrete → pictorial → abstract. No formula before the child can show it on beads. Used in Bridge + Senior.','#34d399'],
          ['Concept of print','Letters track left-to-right · sentences have spaces · books have authors. Pre-reading rituals only.','#38bdf8'],
          ['Assessment practice',`Ask one child a real question · listen for the answer's gap · re-teach to that gap. Repeat with two other children.`,'#c084fc'],
        ].map(([t,what,color])=>`
          <div style="padding:18px 16px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:12px">
            <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:8px">${t}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.55">${what}</div>
          </div>`).join('')}
      </div></div>`],
};

// ─── YRC: Youth Resource Centre ──────────────────────────────────────────────
const YRC = {
  slug: 'youth-resource-centre',
  newSlide2Html: whySlide(
    '15–21 is the year the slum loses the youth',
    'Drop-out, early marriage, addiction, unsafe work, debt traps — the choices that lock in adult precarity happen here. The YRC catches them at the crossroads.',
    [
      ['~70% drop', 'after Class 10 in our settlements. The school no longer holds them; nothing else does either. By 18 they are working informally, often illegally.'],
      ['Group, not 1-on-1', 'is the unit of change. Youth who meet weekly with peers — talk, plan, run something together — build agency. Case-work alone doesn\'t.'],
      ['~14 schemes', 'a youth is eligible for — scholarships, skill stipends, PMJJBY, PMSBY, voter ID, Aadhaar update, Jan Dhan, ration card. Most access 1–2.'],
      ['Crisis is constant', 'addiction, abuse, mental health, debt, legal trouble. YRC is the safe room to bring those in. Referral network must exist before the first crisis.'],
    ],
    'The goal isn\'t entitlement delivery. It\'s building the leadership bench in the slum so the next 5 years of youth have someone in the room who has done this before.',
  ),
  diagramSlides: [`
<div class="slide bg-indigo" id="sX_yrc1">
      <div class="label" style="color:#a78bfa">THE YOUTH JOURNEY</div>
      <h2 class="title">Enumerate → group → build → lead → act</h2>
      <h3 class="sub">Each rung must hold for the next to land. Most YRCs fail at rung 2: they enumerate but never form sticky groups.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;max-width:1180px">
        ${[
          ['📋','Enumerate','Door-to-door survey · all youth 15–21 · age · education · work · risk flags · scheme eligibility','#fbbf24'],
          ['👥','Mobilise','Form youth groups of 12–18 · meet weekly · friendship + fun before agenda · attendance is everything','#34d399'],
          ['🛠','Build','Capacity-building sessions: life skills, scheme prep, English, computer, gender, sexual health, money, voter rights','#38bdf8'],
          ['📜','Link','Aadhaar update, voter ID, PMJJBY/PMSBY, scholarship, skill stipend, bank account, ration card add-on','#c084fc'],
          ['🚀','Lead','Youth leadership programme · youth-led social action · 1 cohort/yr · alumni become facilitators','#fb7185'],
        ].map(([icon,name,what,color],i,arr)=>`
          <div style="position:relative;padding:18px 12px;background:rgba(255,255,255,.05);border:1px solid ${color}40;border-radius:10px;text-align:center">
            <div style="font-size:28px;margin-bottom:6px">${icon}</div>
            <div style="font-size:12px;font-weight:700;color:${color}">${name}</div>
            <div style="font-size:10px;color:#cbd5e1;margin-top:4px;line-height:1.5">${what}</div>
            ${i<arr.length-1?`<div style="position:absolute;top:38px;right:-9px;font-size:16px;color:${color};z-index:2">→</div>`:''}
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-rose" id="sX_yrc2">
      <div class="label" style="color:#fb7185">CRISIS PATHWAY</div>
      <h2 class="title">Don't improvise the response. Build the referral network in week 1.</h2>
      <h3 class="sub">When a youth walks in mid-crisis, your only job is the next 30 minutes. The right person at the right number is the difference.</h3>
      <div style="margin-top:28px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px">
        ${[
          ['💉','Substance use','De-addiction centre (govt or NGO) · counsellor link · family conversation only after rapport · NEVER moralise · same-day to 7-day window','#fb7185'],
          ['🛡','Abuse / safety','Childline 1098 · POCSO procedure · 181 women helpline · partner shelter · physical safety FIRST, paperwork after','#fbbf24'],
          ['🎓','Drop-out / re-enrol','Govt school re-admission (RTE) · NIOS / open school · skill training · school principal contact before reaching the youth','#34d399'],
          ['💭','Mental health','District mental health programme · NIMHANS toll-free 080-46110007 · peer-support group within YRC · stigma is the biggest barrier','#38bdf8'],
          ['💸','Debt / livelihood','Jan Dhan + emergency PMJDY overdraft · skill placement · MGNREGA urban variant · don\'t lend YRC money','#c084fc'],
          ['⚖','Legal','Legal aid clinic (DLSA) · paralegal volunteers · police harassment: written record + senior officer escalation','#a78bfa'],
        ].map(([icon,what,how,color])=>`
          <div style="padding:16px;background:rgba(255,255,255,.04);border:1px solid ${color}40;border-radius:10px">
            <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px"><div style="font-size:22px">${icon}</div><div style="font-size:13px;font-weight:700;color:${color}">${what}</div></div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.55">${how}</div>
          </div>`).join('')}
      </div>
      <p class="body" style="margin-top:16px;font-size:13px;color:#fecaca;font-style:italic;max-width:1180px">Print this list. Stick it on the inside of the YRC office cupboard. Refresh phone numbers every quarter. The crisis comes when the laptop is closed.</p></div>`],
};

// ─── YRC Existing ────────────────────────────────────────────────────────────
const YRC_EX = {
  slug: 'youth-resource-centre-existing',
  newSlide2Html: whySlide(
    'YRC retention rests on weekly meet quality, not annual events',
    'If the weekly group meet feels useful, the youth come. If it doesn\'t, they don\'t — and the YRC becomes an empty room.',
    [
      ['Weekly meet', 'is the heartbeat. Same time, same place, same group. Skip it twice and attendance halves. Treat it like a non-negotiable show.'],
      ['Monthly metrics', 'matter: meet attendance, scheme linkage count, alumni who returned this month, new youth enrolled. CO reports up; ZL reviews monthly.'],
      ['Crisis check', 'in every CO visit: anyone we know in trouble we don\'t know about? Anyone we referred and lost track of? Close those loops or they go missing.'],
      ['Alumni track', 'is the long-term asset. Where are the leadership cohort grads now? Bring them back monthly to talk to current youth — they are the proof it works.'],
    ],
    null,
  ),
  diagramSlides: [`
<div class="slide bg-emerald" id="sX_yrce1">
      <div class="label" style="color:#34d399">WEEKLY MEET ANATOMY</div>
      <h2 class="title">90 minutes that decide YRC's reputation</h2>
      <h3 class="sub">Same structure every week. Reliability is what builds the habit.</h3>
      <div style="margin-top:28px;display:grid;gap:8px;max-width:1080px">
        ${[
          ['0–10 min','Ice-breaker / catch-up · names · what was the week like · keep light','#fbbf24'],
          ['10–25 min','Recap last week\'s topic · ask 2 people what they remember · don\'t lecture, draw it out','#34d399'],
          ['25–55 min','This week\'s topic · 1 idea, 1 activity, 1 story · pre-prepared by CO with TLM','#38bdf8'],
          ['55–75 min','Group activity / discussion · everyone speaks · CO listens more than speaks','#c084fc'],
          ['75–90 min','Wrap · 1 action each for the week · note attendance · close with same ritual every week','#fb7185'],
        ].map(([t,what,color])=>`
          <div style="display:grid;grid-template-columns:90px 1fr;gap:14px;padding:10px 16px;background:rgba(255,255,255,.04);border-left:3px solid ${color};border-radius:8px;align-items:center">
            <div style="font-size:13px;font-weight:700;color:${color}">${t}</div>
            <div style="font-size:13px;color:#cbd5e1;line-height:1.5">${what}</div>
          </div>`).join('')}
      </div></div>`,`
<div class="slide bg-violet" id="sX_yrce2">
      <div class="label" style="color:#c084fc">MONTHLY DASHBOARD</div>
      <h2 class="title">Six numbers that tell you if a YRC is healthy</h2>
      <h3 class="sub">All six tracked in MIS. Any one off-track for 2 months running = ZL intervention.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px">
        ${[
          ['Avg weekly attendance','≥ 75% of enrolled · drop below = re-mobilise · investigate which sub-group is missing','#fbbf24'],
          ['Crisis cases active','Track open vs closed · no case should be open > 30d without an action note','#fb7185'],
          ['Scheme linkages this month','At least 3–5 per centre · counts only when document/benefit is in the youth\'s hand','#34d399'],
          ['New enrolments','Cohort renewal · slum births a youth every week · YRC should onboard 1–2/month minimum','#38bdf8'],
          ['Alumni touchpoints','How many old grads came back this month · low = future leadership pipeline empty','#c084fc'],
          ['Govt office visits','Aadhaar centre, scheme office, school · counts CO accompanying youth · low = independence not built','#a78bfa'],
        ].map(([metric,what,color])=>`
          <div style="padding:18px;background:rgba(255,255,255,.05);border-left:3px solid ${color};border-radius:10px">
            <div style="font-size:13px;font-weight:700;color:${color};margin-bottom:6px">${metric}</div>
            <div style="font-size:11px;color:#cbd5e1;line-height:1.55">${what}</div>
          </div>`).join('')}
      </div></div>`],
};

await applyBatch([CLC, CLC_EX, YRC, YRC_EX]);
