// components/DocContent.tsx
// All the static document content. Split out from page.tsx for readability.
// Section anchors are used to attach interactive elements.

export function DocHeader() {
  return (
    <div className="header">
      <div className="header-tag">Programme Note · For internal leadership review</div>
      <h1>Seeding Programme</h1>
      <p className="lede">A consolidated plan to seed 1,000 young people over five years into new organisations across our priority geographies. This note replaces both the Bangalore Urban Fellowship proposal and the Back-to-Roots alumni incubation note.</p>
      <div className="stats-strip">
        <div className="stat">
          <div className="stat-label">Year 5 scale</div>
          <div className="stat-value">1,000<span className="stat-unit">candidates</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Programme outlay</div>
          <div className="stat-value">₹460<span className="stat-unit">Cr / 5y</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Operations</div>
          <div className="stat-value">₹140-180<span className="stat-unit">Cr / 5y</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Geographies</div>
          <div className="stat-value">10<span className="stat-unit">in 3 phases</span></div>
        </div>
      </div>
    </div>
  );
}

export const SECTIONS = [
  { id: 's1', num: 'I', title: 'Context' },
  { id: 's2', num: 'II', title: 'Direction & design principles' },
  { id: 's3', num: 'III', title: 'Programme model' },
  { id: 's4', num: 'IV', title: 'Workflow' },
  { id: 's5', num: 'V', title: 'Geographies & rollout' },
  { id: 's6', num: 'VI', title: 'Cost' },
  { id: 's7', num: 'VII', title: 'Operational infrastructure' },
  { id: 's8', num: 'VIII', title: 'Communication & outreach' },
  { id: 's9', num: 'IX', title: 'What we are deliberately not doing' },
  { id: 's10', num: 'X', title: 'Risks & mitigations' },
  { id: 's11', num: 'XI', title: 'Immediate next steps' },
  { id: 's12', num: 'XII', title: 'Assumptions & open decisions' },
];

export const DECISIONS = [
  { n: 1, t: 'Scale ambition',
    r: '1,000 candidates by Year 5 with steady ramp. Anchors a meaningful national programme without overstretching geo absorption.',
    a: '500 (more conservative) or 2,500-5,000 (more aggressive).',
    c: '500: lower outlay, smaller central team, slower national presence. 2,500+: requires faster geo team build-up, larger portal, materially higher overhead.' },
  { n: 2, t: 'Per-candidate envelope',
    r: '₹20L/year individual, ₹15L/year for group members. Mirrors Bangalore Urban Fellowship; gives room for genuine programmatic work.',
    a: 'Lower (₹12-15L individual) or higher (₹25L+ with larger settlement footprint).',
    c: 'Lower envelope reduces 5-year outlay but constrains depth. Higher envelope improves quality but raises ₹460 Cr to ₹550-600 Cr.' },
  { n: 3, t: 'Duration of support',
    r: '5 years per candidate. Allows institution-building and runway to fundraise independently.',
    a: '3 years (with optional extension) or open-ended (milestone-gated).',
    c: '3 years pushes more candidates to graduate or fail faster, lowers per-candidate cost, increases churn risk. Milestone-gated gives more control but adds review load.' },
  { n: 4, t: 'Geo handholding ratio',
    r: '1:12-15. Tight enough for early-stage support, sustainable to staff.',
    a: 'Lighter (1:20-25) or denser (1:8-10).',
    c: 'Lighter: ~50 staff and ₹8-10 Cr/year, but quality drops. Denser: ~120 staff, adds ₹6-8 Cr.' },
  { n: 5, t: 'Number of partner institutions',
    r: '4-5 in Year 1 (APU + 3-4), expanding to 10-12 by Year 3. Real relationships, not transactional.',
    a: 'APU-only (simpler) or 20+ institutions (broader pool).',
    c: 'APU-only narrows funnel, concentrates dependency. 20+ adds 4-5 sourcing staff and dilutes relationship quality.' },
  { n: 6, t: 'Group composition rule',
    r: 'Pre-existing working relationship required. No assembled groups. Maximum 3 founders.',
    a: 'Allow assembled groups; allow 4-5 founder groups.',
    c: 'Assembled groups raise group-failure risk. Larger founder groups complicate equity and decision-making.' },
  { n: 7, t: 'Portal build approach',
    r: 'Custom build, phased rollout. Minimal in 4-6 months; full feature set in 12-18 months. Bitstops as base where it fits.',
    a: 'Off-the-shelf platform or fully outsourced build.',
    c: 'Off-the-shelf reduces upfront cost but limits screening flexibility and trilingual support. Fully outsourced raises annual run cost 30-40%.' },
  { n: 8, t: 'Open call versus alumni-only',
    r: 'Three priority routes (APU, partner institutions, internal referrals) before open call. Open call to fill gaps.',
    a: 'Alumni-only (no open call) or open-call-led from start.',
    c: 'Alumni-only constrains funnel, locks out strong non-alumni. Open-call-led raises screening load 3-4x and dilutes priority categories.' },
  { n: 9, t: 'Continuation and exit norms',
    r: 'Annual review with explicit discontinuation criteria. Settlements handed back cleanly on exit.',
    a: 'Lighter annual review (touch-base only) or harder gating (semi-annual milestones).',
    c: 'Lighter review allows weak entities to consume support. Harder gating creates more administrative load and may discourage risk-taking.' },
];
