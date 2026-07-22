// Slug generation for the Phase 3 public read-only view. Deterministic from
// the plan name; falls back to appending an id suffix if a collision exists.

import prisma from "@/lib/prisma";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "plan";
}

export async function generateUniquePublicSlug(name: string, ignorePlanId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;
  // Bounded loop — collisions are rare with 5 pilot schools.
  while (true) {
    const clash = await prisma.schoolPlan.findFirst({
      where: { publicSlug: candidate, ...(ignorePlanId ? { NOT: { id: ignorePlanId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
    if (suffix > 25) return `${base}-${Date.now().toString(36)}`;
  }
}
