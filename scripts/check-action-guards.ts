/**
 * Every server action under app/(budget) must check WHO is calling, not just
 * THAT someone is.
 *
 * This exists because the same bug was found nine times by hand, in four
 * different stages, always with the same shape: `requireSession()` — or
 * `auth()` plus a null check — and nothing else. It answers "is anyone there",
 * which is not a permission. Every instance was in code no screen had called
 * yet, so nothing was ever exploited and nothing ever failed; they were found
 * only because somebody happened to read the file while building the screen in
 * front of it.
 *
 * A static scan is a blunt instrument and deliberately so. It cannot tell a
 * correct gate from an incorrect one, and it is not trying to: it asks whether
 * the author wrote down an answer to "who", and fails if they did not. That
 * catches the one failure mode that actually occurred — a new action shipped
 * with an authentication check standing in for an authorisation check.
 *
 * Run: npx tsx scripts/check-action-guards.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "app/(budget)";

/**
 * Any of these in a function body counts as having answered "who".
 *
 * Deliberately generous — a false pass is better than a script people disable.
 * The locally defined guards are named too, because that is how most of these
 * files express the gate.
 */
const GATES = [
  // Role predicates
  "isSuperAdmin", "isBudgetAdmin", "isAdminUser", "isBudgetAdminOrSuperAdmin",
  // Record access
  "canAccessBudget", "requireBudgetAccess", "withBudgetLineWrite", "requireGrantingUnit",
  "assertCan", "partnerCanAccessBudget",
  // Delegation of authority
  "requireAuthority", "checkAuthority",
  // Locally defined guards
  "requireGrantReviewer", "requireGrantReader", "requireInternalGrantReader",
  "requireInternalStaff", "requireGrantReviewerVia", "requireGrantReaderVia",
  "requireRegistryAdmin", "requireIntakeStaff", "requireManager", "requireGrantee",
  "requireDraftParticipant", "requireBudgetAdmin",
  "guard()",
  // An explicit refusal of some kind
  "Forbidden",
];

/**
 * Actions that legitimately need nothing more than a session, with the reason.
 *
 * Empty, and that is the point: every exported action under app/(budget) has
 * something to say about who may call it. An entry here is a claim that one
 * does not, and it has to carry its argument.
 */
const ALLOWED_SESSION_ONLY: Record<string, string> = {};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const failures: string[] = [];
let checked = 0;
let files = 0;

for (const file of walk(ROOT)) {
  const text = readFileSync(file, "utf8");
  if (!text.startsWith('"use server"') && !text.includes('\n"use server"')) continue;
  files++;

  const lines = text.split("\n");
  const starts = lines
    .map((l, i) => (l.startsWith("export async function") ? i : -1))
    .filter((i) => i >= 0);
  starts.push(lines.length);

  for (let k = 0; k < starts.length - 1; k++) {
    const header = lines[starts[k]];
    const name = header.split(/\s+/)[3]?.replace(/\(.*/, "") ?? "?";
    const body = lines.slice(starts[k], starts[k + 1]).join("\n");
    checked++;

    if (GATES.some((g) => body.includes(g))) continue;
    if (ALLOWED_SESSION_ONLY[`${file}:${name}`]) continue;

    failures.push(
      `${file}:${starts[k] + 1} ${name}() has no role or record check — ` +
        `a session is not a permission. Add one of the gates in this script, or, if it ` +
        `genuinely needs none, say why in ALLOWED_SESSION_ONLY.`,
    );
  }
}

console.log(
  `\n[check-action-guards] ${checked} exported action(s) in ${files} server-action file(s) under ${ROOT}`,
);
if (failures.length) {
  console.error(`[check-action-guards] ${failures.length} UNGATED:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("[check-action-guards] every one answers who may call it.\n");
