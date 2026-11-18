#!/usr/bin/env node
// Build gate for Urban Operations (docs/urban-operations-spec.md, rules R1, R2, R6).
// Runs before every build; any violation fails the deploy.
//
//   R1  every page / layout under app/(urban) calls requireActor(); every route
//       handler under app/api/urban calls requireActorForAction(); every exported
//       server action calls requireActorForAction() AND authorize().
//   R2  nothing but lib/urban/time.ts computes a calendar date by slicing an ISO string.
//   R6  no designation literal ("Leader", "PM", "ZL", "RP") outside lib/urban/access.ts.
//
// Plain Node, no dependencies, so it runs before `prisma generate`.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dirs = ["app/(urban)", "app/api/urban", "lib/urban"].map((d) => path.join(root, d));
const problems = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

/** Bodies of `export async function name(...)[: ReturnType] { ... }`. */
function exportedFunctions(src) {
  const out = [];
  const re = /export\s+async\s+function\s+(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    // 1. match the parameter list's parentheses
    let j = m.index + m[0].length, depth = 1;
    for (; j < src.length && depth; j++) { if (src[j] === "(") depth++; else if (src[j] === ")") depth--; }
    // 2. skip a return type: the body starts at the first "{" outside any <...>
    let angle = 0;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "<") angle++;
      else if (c === ">" && src[j - 1] !== "=") angle--;
      else if (c === "{" && angle === 0) break;
    }
    // 3. match the body's braces, skipping strings
    const i = j;
    let brace = 0, quote = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === "\\") j++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "{") brace++;
      else if (c === "}" && --brace === 0) break;
    }
    out.push({ name: m[1], body: src.slice(i, j + 1) });
  }
  return out;
}

const rel = (p) => path.relative(root, p);

for (const file of dirs.flatMap(walk)) {
  const src = fs.readFileSync(file, "utf8");
  const r = rel(file);
  const base = path.basename(file);
  const inApp = r.startsWith("app/");

  // R1 — pages and layouts
  if (inApp && r.startsWith("app/(urban)") && /^(page|layout)\.tsx$/.test(base) && !/\brequireActor\(\)/.test(src)) {
    problems.push(`${r}: a page/layout must call requireActor() (R1)`);
  }
  // R1 — route handlers
  if (r.startsWith("app/api/urban") && base === "route.ts" && !/\brequireActorForAction\(\)/.test(src)) {
    problems.push(`${r}: a route handler must call requireActorForAction() (R1)`);
  }
  // R1 — server actions
  if (inApp && /^\s*["']use server["']/m.test(src.split("\n").slice(0, 5).join("\n"))) {
    for (const f of exportedFunctions(src)) {
      if (!/\brequireActorForAction\(\)/.test(f.body) || !/\bauthorize\(/.test(f.body)) {
        problems.push(`${r}: server action ${f.name}() must call requireActorForAction() and authorize() (R1)`);
      }
    }
  }
  // R2 — dates
  if (r !== "lib/urban/time.ts" && /toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(src)) {
    problems.push(`${r}: compute dates with lib/urban/time.ts, not toISOString().slice(0, 10) (R2)`);
  }
  // R6 — roles
  if (r !== "lib/urban/access.ts" && /["'](Leader|PM|ZL|RP)["']/.test(src.replace(/\/\/.*$/gm, ""))) {
    problems.push(`${r}: designation literals belong in lib/urban/access.ts only (R6)`);
  }
}

if (problems.length) {
  console.error(`\n✖ Urban Operations access check failed (${problems.length}):\n  ${problems.join("\n  ")}\n`);
  process.exit(1);
}
console.log("✓ Urban Operations access check passed");
