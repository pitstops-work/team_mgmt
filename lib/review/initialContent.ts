// Initial HTML content and prompts for each section.
// Used when no DB content exists yet. Admin edits flow into the DB.

export const INITIAL_PROMPTS: Record<string, string> = {
  s5: 'Each geography enters with its own demand estimate. Does this match your read of geo team capacity?',
  s6: 'The cost projection assumes 60% group / 40% individual mix. Does this feel right based on what you\'ve seen in similar programmes?',
  s7: 'The 1:12-15 handholding ratio is the single biggest operational commitment. If field reality requires 1:8-10, geo headcount roughly doubles. What\'s your read?',
};

export const INITIAL_CONTENT: Record<string, string> = {
  s1: `<p>The vibrancy of the social sector in our focus geographies is uneven, and we have not been able to identify enough partners to expand. Loading existing partners further is not sustainable. This programme is the answer.</p>`,
  s2: `<p>Settled positions, framing the rest of the document. These are not open for re-debate at this review.</p>`,
  s3: `<p>Who we seed, where they work, what they do, and how long we support them.</p>`,
  s4: `<p>From sourcing through to handholding. Central functions handle the funnel; geographies own the field.</p><div data-component="workflow-diagram"></div>`,
  s5: `<p>Staggered. A geography is brought in only when needs assessment is complete and the geo team has allocated handholding capacity.</p>`,
  s6: `<p>Anchored to the Bangalore Urban Fellowship envelope. Two cost tracks — individuals at ₹20L/year, groups at ₹15L/person/year.</p><div data-component="cost-chart"></div>`,
  s7: `<p>Six infrastructure pillars. Total operational overhead at full scale: ₹28.7-36.7 Cr/year (~17-22% of programme outlay).</p>`,
  s8: `<p>Selective by design. We do not run a marketing campaign. We want the right people, not volume we cannot absorb.</p>`,
  s9: `<p>The negative space matters. Each "not" is a settled position that gives the programme its shape.</p>`,
  s10: `<p>The seven failure modes most likely to derail this, and what we are doing about each.</p>`,
  s11: `<p>Subject to leadership approval of this design.</p>`,
  s12: `<p>What's assumed, what's settled, and what needs your view. Use the agree / discuss / disagree buttons on each open decision.</p>`,
};
