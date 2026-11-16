// How a /field step is evidenced when it is marked done. Shared by the backend
// editor, the RP screen and the API guards — keep it prisma-free so a
// "use client" file can import it (see client_server_boundary_prisma).
//
// Same vocabulary as the legacy ChecklistItem.completionType, so a value read
// from an old template or catalog item drops straight in.
export const CLOSURE_TYPES = ["Activity", "Voice", "Upload"] as const;
export type ClosureType = (typeof CLOSURE_TYPES)[number];

export const CLOSURE_LABEL: Record<ClosureType, string> = {
  Activity: "Mark done",
  Voice: "Voice note",
  Upload: "Photo",
};

export function normalizeClosureType(v: unknown): ClosureType {
  return CLOSURE_TYPES.includes(v as ClosureType) ? (v as ClosureType) : "Activity";
}

/** True when marking the step done needs a recorded voice note or photo first. */
export function needsProof(closureType: unknown): boolean {
  const t = normalizeClosureType(closureType);
  return t === "Voice" || t === "Upload";
}

/** Reason a step can't be closed for want of proof, or null when it can. */
export function proofBlocker(closureType: unknown, proofCount: number): string | null {
  if (!needsProof(closureType) || proofCount > 0) return null;
  return normalizeClosureType(closureType) === "Voice" ? "Record a voice note first" : "Add a photo first";
}
