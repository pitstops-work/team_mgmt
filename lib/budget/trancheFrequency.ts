/**
 * Release frequency: periods per year, and a label for each.
 *
 * Its own module with NOTHING but a type import, because the agreement screen
 * is a client component and needs these. Pulling them from
 * `lib/budget/tranches.ts` compiled fine and then failed the build — that file
 * imports prisma, so a value import from a client component dragged `fs`,
 * `net`, `tls` and `dns` into the browser bundle. `tsc --noEmit` cannot see
 * that boundary; only the bundler can.
 *
 * Both maps are `Record<TrancheFrequency, …>` on purpose. Adding a frequency to
 * the enum without a period count would divide a year's money by `undefined`;
 * adding one without a label would leave it storable but missing from the
 * agreement screen's picker. Being a Record makes either omission a compile
 * error instead.
 */

import type { TrancheFrequency } from "@/app/generated/prisma/client";

export const PERIODS_PER_YEAR: Record<TrancheFrequency, number> = {
  annual: 1,
  half_yearly: 2,
  quarterly: 4,
};

export const TRANCHE_FREQUENCY_LABELS: Record<TrancheFrequency, string> = {
  annual: "Annual",
  half_yearly: "Every six months",
  quarterly: "Quarterly",
};
