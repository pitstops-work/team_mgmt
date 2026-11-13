/**
 * Caps for the public application form.
 *
 * Prisma-free on purpose: the form is a client component, and importing these
 * from `publicIntake.ts` — which reaches prisma — typechecks clean and then
 * fails the build with "Can't resolve 'dns'". `tsc` cannot see the client/server
 * bundler boundary, so the only defence is keeping shared constants in a module
 * that has nothing to resolve. This work has paid for that lesson once already.
 *
 * They live in one place so the form can show a character count the server will
 * actually accept. Two numbers that are meant to be equal and are maintained
 * separately are two numbers that will differ.
 */
export const INTAKE_LIMITS = {
  shortText: 200,
  longText: 6_000,
  summary: 4_000,
  domains: 8,
  /** Across every answer, after validation. */
  answersBytes: 60_000,
  maxRequestedAmount: 1_000_000_000,
  maxMonths: 120,
  /** Per salted IP hash. */
  startsPerHour: 5,
  startsPerDay: 15,
} as const;
