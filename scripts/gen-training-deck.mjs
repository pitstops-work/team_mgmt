// Generates a starter HTML training deck for a GoalTemplateDef row.
// Output: public/training/<slug>.html
// Usage:  node --env-file=/tmp/.env.app.pulled scripts/gen-training-deck.mjs <slug> [<slug> ...]
//         node --env-file=/tmp/.env.app.pulled scripts/gen-training-deck.mjs --all
//
// The output is a SKELETON — slide structure auto-built from DB data.
// Hand-author narrative, diagrams, and additional slides on top.
// Re-running will OVERWRITE the file, so move hand-authored content
// to a marked region or work in a renamed file once you start editing.

import { neon } from '@neondatabase/serverless';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(PROJECT_ROOT, 'public', 'training');

const sql = neon(process.env.DATABASE_URL);

const BG_ROTATION = ['bg-navy', 'bg-indigo', 'bg-slate', 'bg-emerald', 'bg-sky', 'bg-violet', 'bg-amber', 'bg-rose', 'bg-teal', 'bg-dark'];

const TYPE_META = {
  Research:  { color: '#818cf8', emoji: '🔍', label: 'Research'  },
  Meeting:   { color: '#c084fc', emoji: '🤝', label: 'Meeting'   },
  Proposal:  { color: '#fbbf24', emoji: '📝', label: 'Proposal'  },
  Budgeting: { color: '#f59e0b', emoji: '💰', label: 'Budgeting' },
  SiteVisit: { color: '#38bdf8', emoji: '🏗', label: 'Site Visit'},
  Milestone: { color: '#fb7185', emoji: '🚩', label: 'Milestone' },
  Training:  { color: '#34d399', emoji: '🎓', label: 'Training'  },
  Review:    { color: '#94a3b8', emoji: '📊', label: 'Review'    },
  Custom:    { color: '#a3a3a3', emoji: '⚙️', label: 'Custom'    },
};

const COMPLETION_META = {
  Activity: { emoji: '✓',  label: 'Mark done', color: '#34d399' },
  Upload:   { emoji: '📎', label: 'Upload',    color: '#38bdf8' },
  Voice:    { emoji: '🎙', label: 'Voice log', color: '#c084fc' },
};

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function htmlForTemplate(t) {
  const pitstops = t.pitstops || [];
  const parameters = t.parameters || [];
  const totalChecklists = pitstops.reduce((n, p) => n + (p.checklist?.length || 0), 0);
  const totalActivities = pitstops.reduce((n, p) => n + (p.checklist?.reduce((m, c) => m + (c.activities?.length || 0), 0) || 0), 0);
  const totalSla = pitstops.reduce((max, p) => Math.max(max, p.slaDays || 0), 0);

  // ── Slides ────────────────────────────────────────────────────────────────
  const slides = [];

  // Slide 1: Title
  slides.push({
    bg: 'bg-navy',
    html: `
      <div style="margin:auto;max-width:920px;text-align:center">
        <div style="font-size:96px;margin-bottom:24px">${esc(t.icon || '🎯')}</div>
        <div class="label" style="color:#a78bfa">${esc(t.category)}</div>
        <h1 class="hero" style="margin-bottom:20px">${esc(t.name)}</h1>
        <p class="body" style="font-size:20px;color:#cbd5e1;max-width:720px;margin:0 auto">${esc(t.description)}</p>
        <div style="margin-top:48px;display:flex;gap:24px;justify-content:center;flex-wrap:wrap">
          <div class="stat-pill"><span class="num">${pitstops.length}</span><span class="lbl">pitstops</span></div>
          <div class="stat-pill"><span class="num">${totalChecklists}</span><span class="lbl">checklists</span></div>
          <div class="stat-pill"><span class="num">${totalActivities}</span><span class="lbl">activities</span></div>
          <div class="stat-pill"><span class="num">${totalSla}d</span><span class="lbl">longest SLA</span></div>
        </div>
      </div>`,
  });

  // Slide 2: Why this matters (HAND-AUTHOR placeholder)
  slides.push({
    bg: 'bg-rose',
    html: `
      <div class="label" style="color:#fb7185">WHY THIS GOAL MATTERS</div>
      <h2 class="title">[Hand-author the 'why' here]</h2>
      <h3 class="sub">Replace this slide with the human story — who this serves, what the absence of it costs, and what success looks like on the ground.</h3>
      <div style="margin-top:40px;padding:32px;background:rgba(251,113,133,.08);border:1px solid rgba(251,113,133,.25);border-radius:16px;max-width:880px">
        <p class="body" style="font-size:18px;line-height:1.7">
          <em style="color:#fda4af">Author note:</em> A staff member should feel the urgency of the problem before they see the steps.
          Pull from the proposal, refined doc, or field anecdotes. Keep it concrete: a household, a price, an avoidable disease, a missed entitlement.
          Numbers from the project area beat statistics from elsewhere.
        </p>
      </div>`,
  });

  // Slide 3: Parameters (skipped if none)
  if (parameters.length > 0) {
    slides.push({
      bg: 'bg-slate',
      html: `
        <div class="label" style="color:#94a3b8">GOAL PARAMETERS</div>
        <h2 class="title">What an RP fills in when creating this goal</h2>
        <h3 class="sub">These shape the scale of every downstream pitstop.</h3>
        <div style="display:grid;gap:16px;margin-top:32px;max-width:880px">
          ${parameters.map(p => `
            <div style="padding:20px 24px;background:rgba(148,163,184,.08);border-left:3px solid #818cf8;border-radius:8px">
              <div style="font-size:13px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px">${esc(p.key)}</div>
              <div style="font-size:20px;font-weight:600;color:#fff">${esc(p.label)}</div>
              ${p.min != null || p.max != null ? `<div style="font-size:14px;color:#94a3b8;margin-top:4px">range: ${esc(p.min ?? '—')} to ${esc(p.max ?? '—')}</div>` : ''}
              ${p.placeholder ? `<div style="font-size:14px;color:#64748b;margin-top:4px">example: ${esc(p.placeholder)}</div>` : ''}
            </div>
          `).join('')}
        </div>`,
    });
  }

  // Slide 4: Journey overview — all pitstops at a glance
  slides.push({
    bg: 'bg-dark',
    html: `
      <div class="label" style="color:#a78bfa">THE JOURNEY</div>
      <h2 class="title">${pitstops.length} pitstops, ${totalSla}-day arc</h2>
      <h3 class="sub">Every pitstop unlocks the next. Skipping or rushing one breaks downstream pitstops.</h3>
      <div style="margin-top:32px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;max-width:1180px">
        ${pitstops.map((p, i) => {
          const meta = TYPE_META[p.type] || TYPE_META.Custom;
          return `
            <div style="padding:16px 20px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;display:flex;gap:14px;align-items:flex-start">
              <div style="font-size:22px;line-height:1;width:32px;text-align:center">${meta.emoji}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:11px;color:${meta.color};text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Pitstop ${i + 1} · ${meta.label} · ${p.slaDays}d</div>
                <div style="font-size:15px;color:#fff;font-weight:600;margin-top:4px">${esc(p.title)}</div>
              </div>
            </div>`;
        }).join('')}
      </div>`,
  });

  // Slides 5...: One slide per pitstop
  pitstops.forEach((p, i) => {
    const meta = TYPE_META[p.type] || TYPE_META.Custom;
    const bg = BG_ROTATION[(i + 4) % BG_ROTATION.length];
    slides.push({
      bg,
      html: `
        <div class="label" style="color:${meta.color}">PITSTOP ${i + 1} OF ${pitstops.length} · ${meta.label.toUpperCase()} · ${p.slaDays} DAYS</div>
        <h2 class="title">${esc(p.title)}</h2>
        <div style="margin-top:20px;padding:20px 24px;background:rgba(255,255,255,.05);border-left:3px solid ${meta.color};border-radius:8px;max-width:900px">
          <div style="font-size:11px;color:${meta.color};letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:8px">Why this pitstop</div>
          <p class="body" style="font-size:15px;line-height:1.65">${esc(p.notes || '[Add rationale for this pitstop]')}</p>
        </div>
        <div style="margin-top:24px;display:grid;gap:10px;max-width:1180px">
          ${(p.checklist || []).map((c, ci) => {
            const acts = (c.activities || []).map(a => {
              const cm = COMPLETION_META[a.completionType] || { emoji: '?', color: '#64748b', label: a.completionType };
              return `<span style="display:inline-flex;gap:6px;align-items:center;padding:3px 10px;background:rgba(255,255,255,.06);border:1px solid ${cm.color}40;border-radius:14px;font-size:11px;color:${cm.color};font-weight:600"><span style="font-size:12px">${cm.emoji}</span>${esc(a.title)}</span>`;
            }).join('');
            return `
              <div style="display:grid;grid-template-columns:24px 1fr;gap:12px;padding:12px 16px;background:rgba(255,255,255,.03);border-radius:8px;align-items:start">
                <div style="font-size:13px;color:${meta.color};font-weight:700;padding-top:2px">${ci + 1}.</div>
                <div>
                  <div style="font-size:14px;color:#e2e8f0;line-height:1.5">${esc(c.text)}</div>
                  ${acts ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${acts}</div>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>`,
    });
  });

  // Final slide: Completion types legend
  slides.push({
    bg: 'bg-teal',
    html: `
      <div class="label" style="color:#5eead4">HOW PITSTOPS GET CLOSED</div>
      <h2 class="title">Three ways to mark a step done</h2>
      <h3 class="sub">Each activity has a completion type. Some need a doc, some a voice note, some just a confirm.</h3>
      <div style="margin-top:48px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1080px">
        ${Object.entries(COMPLETION_META).map(([k, v]) => `
          <div style="padding:32px 24px;background:rgba(255,255,255,.05);border:1px solid ${v.color}40;border-radius:14px;text-align:center">
            <div style="font-size:56px;margin-bottom:12px">${v.emoji}</div>
            <div style="font-size:24px;font-weight:700;color:${v.color}">${k}</div>
            <div style="font-size:14px;color:#94a3b8;margin-top:6px">${v.label}</div>
          </div>
        `).join('')}
      </div>`,
  });

  // Closing slide
  slides.push({
    bg: 'bg-navy',
    html: `
      <div style="margin:auto;max-width:780px;text-align:center">
        <div style="font-size:72px;margin-bottom:20px">${esc(t.icon || '🎯')}</div>
        <h1 class="hero" style="font-size:44px">Follow the pitstops. The community will see the difference.</h1>
        <p class="body" style="margin-top:24px;font-size:18px;color:#cbd5e1">Every checklist exists because a previous project failed without it. Don't skip steps.</p>
        <div style="margin-top:48px;display:flex;gap:16px;justify-content:center">
          <a href="/pitstops-training.html" style="padding:14px 28px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:50px;color:#fff;text-decoration:none;font-weight:600">← Back to training hub</a>
        </div>
      </div>`,
  });

  // ── Assemble final HTML ───────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(t.name)} — Training</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#fff;overflow:hidden;height:100vh}
.deck{width:100vw;height:100vh;position:relative}
.slide{position:absolute;inset:0;display:none;flex-direction:column;padding:48px 64px;opacity:0;transition:opacity .4s;overflow-y:auto}
.slide.active{display:flex;opacity:1}
#nav{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:12px;align-items:center;z-index:99;background:rgba(255,255,255,.08);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12);border-radius:50px;padding:8px 18px}
#nav button{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:4px 10px;border-radius:8px;transition:all .2s}
#nav button:hover{color:#fff;background:rgba(255,255,255,.12)}
#nav button:disabled{opacity:.3;cursor:not-allowed}
#nav a{color:#94a3b8;text-decoration:none;font-size:13px;padding:4px 12px;border-radius:8px}
#nav a:hover{color:#fff;background:rgba(255,255,255,.12)}
#slide-counter{color:#64748b;font-size:13px;min-width:60px;text-align:center}
.progress{position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,#6366f1,#a855f7);transition:width .3s;z-index:100}
.bg-navy{background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)}
.bg-indigo{background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%)}
.bg-emerald{background:linear-gradient(135deg,#022c22 0%,#064e3b 100%)}
.bg-sky{background:linear-gradient(135deg,#0c1a2e 0%,#0c4a6e 100%)}
.bg-violet{background:linear-gradient(135deg,#1a0533 0%,#3b0764 100%)}
.bg-amber{background:linear-gradient(135deg,#1c1007 0%,#451a03 100%)}
.bg-rose{background:linear-gradient(135deg,#1a0010 0%,#4c0519 100%)}
.bg-teal{background:linear-gradient(135deg,#001a1a 0%,#042f2e 100%)}
.bg-dark{background:linear-gradient(135deg,#09090b 0%,#18181b 100%)}
.bg-slate{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%)}
h1.hero{font-size:56px;font-weight:800;line-height:1.1;letter-spacing:-1.5px}
h2.title{font-size:36px;font-weight:700;letter-spacing:-0.5px;margin-bottom:8px;line-height:1.2}
h3.sub{font-size:18px;font-weight:400;color:#94a3b8;margin-bottom:24px}
.label{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.7;margin-bottom:8px}
p.body{font-size:16px;line-height:1.7;color:#cbd5e1}
.stat-pill{display:flex;flex-direction:column;align-items:center;padding:16px 24px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;min-width:120px}
.stat-pill .num{font-size:32px;font-weight:800;color:#fff;line-height:1}
.stat-pill .lbl{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-top:6px}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.slide.active>*{animation:fadeUp .55s ease-out both}
.slide.active>*:nth-child(2){animation-delay:.08s}
.slide.active>*:nth-child(3){animation-delay:.16s}
.slide.active>*:nth-child(4){animation-delay:.24s}
.slide.active>*:nth-child(5){animation-delay:.32s}
</style>
</head>
<body>
<div class="progress" id="progress"></div>
<div class="deck">
${slides.map((s, i) => `<div class="slide ${s.bg}${i === 0 ? ' active' : ''}" id="s${i + 1}">${s.html}</div>`).join('\n')}
</div>
<div id="nav">
  <a href="/pitstops-training.html" title="Back to training hub">⌂ Hub</a>
  <button onclick="go(-1)" id="prev">←</button>
  <span id="slide-counter">1 / ${slides.length}</span>
  <button onclick="go(1)" id="next">→</button>
</div>
<script>
const total=${slides.length};
let cur=1;
function show(n){
  document.querySelectorAll('.slide').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById('s'+n);
  if(!el)return;
  el.classList.add('active');
  el.scrollTop=0;
  cur=n;
  document.getElementById('slide-counter').textContent=n+' / '+total;
  document.getElementById('progress').style.width=(n/total*100)+'%';
  document.getElementById('prev').disabled=(n===1);
  document.getElementById('next').disabled=(n===total);
  location.hash='s'+n;
}
function go(d){show(Math.max(1,Math.min(total,cur+d)))}
document.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown')go(1);
  else if(e.key==='ArrowLeft'||e.key==='PageUp')go(-1);
  else if(e.key==='Home')show(1);
  else if(e.key==='End')show(total);
});
// Deep-link via #sN
const initial=parseInt(location.hash.replace('#s',''))||1;
if(initial>=1&&initial<=total)show(initial);
else show(1);
</script>
</body>
</html>`;
}

// ─── Training hub (index page) ───────────────────────────────────────────────
// List of decks that have been hand-authored on top of the skeleton.
// Used by the hub to show an "Authored" badge vs "Auto-generated" for the rest.
const AUTHORED_SLUGS = new Set([
  // Original anchors
  'community-toilet', 'creche-program', 'welfare-rights',
  // Batch 1: centres
  'children-learning-centre', 'children-learning-centre-existing',
  'youth-resource-centre', 'youth-resource-centre-existing',
  // Batch 2: water + elderly + remaining existing
  'water-atm', 'water-atm-existing',
  'elderly-kitchen', 'elderly-kitchen-existing',
  'elderly-centre', 'elderly-centre-existing',
  'creche-program-existing', 'community-toilet-existing',
  // Batch 3: drives + seeding
  'scheme-linkage-drive', 'seeding-programme',
  // Batch 4: zonal leadership
  'zone-review', 'grant-proposal', 'grant-proposal-renewal',
  'partner-management', 'partner-management-existing',
  // Batch 5: food distribution
  'food-distribution-launch', 'food-distribution-monthly', 'food-distribution-new-dp',
]);

function htmlForHub(rows) {
  // Group by category, preserving sortOrder within each
  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category).push(r);
  }

  // Preferred category display order — others fall through after
  const CAT_ORDER = ['Community Programs', 'Food Programme', 'Programmes', 'Field Programmes', 'Zonal Leadership'];
  const sortedCats = [...byCat.keys()].sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a); const ib = CAT_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const totalActive = rows.length;
  const authoredCount = rows.filter(r => AUTHORED_SLUGS.has(r.slug)).length;
  const totalPitstops = rows.reduce((n, r) => n + (r.pitstops?.length || 0), 0);

  const tile = (icon, title, sub, href, badge = '') => `
    <a href="${href}" class="tile">
      <div class="tile-icon">${icon}</div>
      <div class="tile-body">
        <div class="tile-title">${esc(title)}</div>
        <div class="tile-sub">${esc(sub)}</div>
      </div>
      ${badge}
      <div class="tile-arrow">→</div>
    </a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Pitstops Training Hub</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);color:#fff;min-height:100vh}
.wrap{max-width:1280px;margin:0 auto;padding:64px 32px 96px}
header{margin-bottom:48px;text-align:center}
.eyebrow{font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#a78bfa;margin-bottom:16px}
h1{font-size:54px;font-weight:800;letter-spacing:-1.5px;line-height:1.1;margin-bottom:16px;background:linear-gradient(135deg,#fff 0%,#cbd5e1 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.tagline{font-size:18px;color:#cbd5e1;max-width:680px;margin:0 auto;line-height:1.6}
.stats{margin-top:32px;display:flex;gap:32px;justify-content:center;flex-wrap:wrap}
.stat{display:flex;flex-direction:column;align-items:center}
.stat-num{font-size:28px;font-weight:800;color:#fff;line-height:1}
.stat-lbl{font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px}
section{margin-top:56px}
.sec-head{display:flex;align-items:baseline;gap:14px;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08)}
.sec-title{font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.3px}
.sec-count{font-size:13px;color:#94a3b8}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.tile{display:flex;align-items:center;gap:16px;padding:18px 20px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;text-decoration:none;color:inherit;transition:all .18s ease;position:relative}
.tile:hover{background:rgba(255,255,255,.07);border-color:rgba(167,139,250,.4);transform:translateY(-2px)}
.tile-icon{font-size:32px;width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border-radius:12px;flex-shrink:0}
.tile-body{flex:1;min-width:0}
.tile-title{font-size:15px;font-weight:600;color:#fff;line-height:1.3;margin-bottom:4px}
.tile-sub{font-size:12px;color:#94a3b8}
.tile-arrow{font-size:18px;color:#475569;transition:all .18s;flex-shrink:0}
.tile:hover .tile-arrow{color:#a78bfa;transform:translateX(4px)}
.badge{position:absolute;top:8px;right:34px;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:2px 7px;border-radius:8px}
.badge-authored{background:rgba(52,211,153,.15);color:#34d399;border:1px solid rgba(52,211,153,.3)}
.badge-skeleton{background:rgba(148,163,184,.1);color:#94a3b8;border:1px solid rgba(148,163,184,.2)}
.intro-tile{display:flex;align-items:center;gap:24px;padding:32px;background:linear-gradient(135deg,rgba(99,102,241,.12) 0%,rgba(168,85,247,.12) 100%);border:1px solid rgba(167,139,250,.3);border-radius:18px;text-decoration:none;color:inherit;transition:all .2s}
.intro-tile:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(99,102,241,.2)}
.intro-icon{font-size:48px;width:80px;height:80px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);border-radius:18px;flex-shrink:0}
.intro-body{flex:1}
.intro-title{font-size:22px;font-weight:700;color:#fff;margin-bottom:6px}
.intro-sub{font-size:14px;color:#cbd5e1;line-height:1.5}
.intro-arrow{font-size:24px;color:#a78bfa}
footer{margin-top:80px;padding-top:32px;border-top:1px solid rgba(255,255,255,.06);text-align:center;color:#64748b;font-size:13px}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">Pitstops · Training Hub</div>
    <h1>Every goal we run, walked through step by step</h1>
    <p class="tagline">Interactive decks that explain the pitstops, the checklists, the activities — and why each one matters for the urban slum communities we serve.</p>
    <div class="stats">
      <div class="stat"><div class="stat-num">${totalActive}</div><div class="stat-lbl">Goal templates</div></div>
      <div class="stat"><div class="stat-num">${totalPitstops}</div><div class="stat-lbl">Total pitstops</div></div>
      <div class="stat"><div class="stat-num">${authoredCount}</div><div class="stat-lbl">Hand-authored</div></div>
    </div>
  </header>

  <section>
    <div class="sec-head">
      <div class="sec-title">Start here</div>
      <div class="sec-count">The platform itself</div>
    </div>
    <a href="/pitstops-presentation.html" class="intro-tile">
      <div class="intro-icon">🏁</div>
      <div class="intro-body">
        <div class="intro-title">About Pitstops</div>
        <div class="intro-sub">The platform overview — what it is, how it works, why we built it. Start here if it's your first day.</div>
      </div>
      <div class="intro-arrow">→</div>
    </a>
  </section>

  ${sortedCats.map(cat => {
    const items = byCat.get(cat);
    return `
      <section>
        <div class="sec-head">
          <div class="sec-title">${esc(cat)}</div>
          <div class="sec-count">${items.length} deck${items.length === 1 ? '' : 's'}</div>
        </div>
        <div class="grid">
          ${items.map(r => {
            const authored = AUTHORED_SLUGS.has(r.slug);
            const badge = authored
              ? `<div class="badge badge-authored">Authored</div>`
              : `<div class="badge badge-skeleton">Auto</div>`;
            const sub = `${r.pitstops?.length || 0} pitstops`;
            return tile(esc(r.icon || '🎯'), r.name, sub, `/training/${r.slug}.html`, badge);
          }).join('')}
        </div>
      </section>`;
  }).join('')}

  <footer>
    Generated from <code>GoalTemplateDef</code>. Re-run <code>scripts/gen-training-deck.mjs --hub</code> after adding or editing templates.
  </footer>
</div>
</body>
</html>`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: gen-training-deck.mjs <slug> [<slug> ...]  |  --all  |  --hub');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  if (args.includes('--hub')) {
    const rows = await sql`SELECT slug, name, description, category, icon, pitstops FROM "GoalTemplateDef" WHERE "isActive" = true ORDER BY "sortOrder", name`;
    const html = htmlForHub(rows);
    const out = resolve(PROJECT_ROOT, 'public', 'pitstops-training.html');
    await writeFile(out, html, 'utf8');
    console.log(`Wrote ${out}  (${rows.length} templates)`);
    if (args.length === 1) return; // hub-only invocation
  }

  const slugArgs = args.filter(a => a !== '--hub' && a !== '--all');
  const allMode = args.includes('--all');

  if (!allMode && slugArgs.length === 0) return;

  const rows = allMode
    ? await sql`SELECT slug, name, description, category, icon, parameters, pitstops FROM "GoalTemplateDef" WHERE "isActive" = true ORDER BY "sortOrder", name`
    : await sql`SELECT slug, name, description, category, icon, parameters, pitstops FROM "GoalTemplateDef" WHERE slug = ANY(${slugArgs})`;

  if (rows.length === 0) {
    console.error('No templates matched.');
    process.exit(1);
  }

  const force = args.includes('--force');
  for (const row of rows) {
    const out = resolve(OUT_DIR, `${row.slug}.html`);
    // Regen guard: skip files containing the HAND_AUTHORED sentinel unless --force
    if (!force) {
      try {
        const existing = await (await import('node:fs/promises')).readFile(out, 'utf8');
        if (existing.includes('HAND_AUTHORED: do not regenerate')) {
          console.log(`Skipped ${out}  (hand-authored; use --force to overwrite)`);
          continue;
        }
      } catch { /* file does not exist — fall through to write */ }
    }
    const html = htmlForTemplate(row);
    await writeFile(out, html, 'utf8');
    const n = (row.pitstops || []).length;
    console.log(`Wrote ${out}  (${n} pitstops → ${4 + n + 2} slides)`);
  }
}

await main();
