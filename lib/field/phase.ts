// Derived lifecycle for a /field intervention — a pure function over its steps,
// mirroring the old lib/operations/phase.ts but far simpler (one flat step list,
// no pitstop-recurrence gymnastics). Phase is NEVER stored; always derived.
export type FieldPhase = "setting_up" | "live" | "done";

export function deriveFieldPhase(args: {
  mode: string;
  setupTotal: number;
  setupDone: number;
  hasVisitRecipe: boolean;
}): FieldPhase {
  const { mode, setupTotal, setupDone, hasVisitRecipe } = args;
  // Any incomplete setup step → still setting up (explicit live mode does not skip setup work).
  if (setupTotal > 0 && setupDone < setupTotal) return "setting_up";
  // Setup done (or none) and there's a live cadence to run → live.
  if (mode === "live" || hasVisitRecipe) return "live";
  // Setup finished with no live phase → done. Nothing to do yet → treat as setting up.
  return setupTotal > 0 ? "done" : "setting_up";
}

/**
 * The named workstream the intervention is currently working through — the
 * "Infrastructure" in "Infrastructure · 3/9".
 *
 * The old spine got this from Pitstop.progressTag via deriveCentrePhase's
 * `currentPhaseLabel`; the rebuild dropped it, so /field could only ever say
 * "Setting up · 3/9". FieldStep.phaseTag restores it.
 *
 * The label is the phaseTag of the FRONT step — the first step, in order, that
 * isn't Done. Returns null once setup is complete, or when the steps carry no
 * tags (a hand-authored domain, or CommunityToilet whose legacy pitstops have
 * none) — callers fall back to PHASE_LABEL[phase].
 */
export function deriveCurrentPhaseLabel(
  setupSteps: { status: string; order: number; phaseTag?: string | null }[],
): string | null {
  const front = setupSteps
    .filter((s) => s.status !== "Done")
    .sort((a, b) => a.order - b.order)[0];
  return front?.phaseTag ?? null;
}

export const PHASE_LABEL: Record<FieldPhase, string> = {
  setting_up: "Setting up",
  live: "Live",
  done: "Done",
};
