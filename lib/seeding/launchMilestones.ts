// Default curated Road-to-Launch milestones + the phase→milestone mapping the
// importer uses to (re)link phases. Milestones are editable in-app afterwards
// (title/order/phase assignment); these are just the seeded defaults, matched
// by a phase's code (first token of its label, e.g. "A0", "C5", "Go-live").

export type DefaultMilestone = { key: string; title: string; phaseCodes: string[] };

export const DEFAULT_LAUNCH_MILESTONES: DefaultMilestone[] = [
  { key: "team_geo",       title: "Core team & geographies committed",        phaseCodes: ["A0", "A1", "B2"] },
  { key: "themes",         title: "Themes & demand list locked",              phaseCodes: ["B1", "B3"] },
  { key: "machinery",      title: "Outreach machinery ready",                 phaseCodes: ["C1", "C2"] },
  { key: "hired",          title: "Team fully hired",                         phaseCodes: ["A2", "A3"] },
  { key: "portal_sel",     title: "Portal, screening & selection ready",      phaseCodes: ["D1", "D2", "D3"] },
  { key: "outreach_live",  title: "Outreach live — referrals, events, digital", phaseCodes: ["C3", "C4", "C5"] },
  { key: "launch",         title: "Launch — call goes live",                  phaseCodes: ["Go-live"] },
  { key: "post_selection", title: "Post-selection design (runs pre-launch)",  phaseCodes: ["E1", "E2", "E3", "E4", "E5"] },
];

/** A phase's code = the first whitespace-delimited token of its label. */
export function phaseCode(label: string): string {
  return label.trim().split(/\s+/)[0] ?? "";
}

export function defaultMilestoneKeyForPhase(label: string): string | null {
  const code = phaseCode(label);
  return DEFAULT_LAUNCH_MILESTONES.find((m) => m.phaseCodes.includes(code))?.key ?? null;
}
