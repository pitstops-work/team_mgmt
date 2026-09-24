/**
 * Turn an exported spreadsheet (CSV or Excel) into ApplicationInputs.
 *
 * Column headers are matched loosely, because the export's exact wording is
 * not settled. Known fields (reference, email, name, geography…) map to their
 * columns; a column of long free text becomes a written answer; everything
 * else is kept as a form answer under its own header. Nothing is dropped.
 *
 * Files are uploaded alongside and matched to a row by the application
 * reference appearing in the file name (APP-0142_cv.pdf), or failing that the
 * applicant's email.
 */

import * as XLSX from "xlsx";
import type { ApplicationInput } from "./intake";
import type { Doc } from "./draft";

type Field = keyof Pick<
  ApplicationInput,
  "ref" | "email" | "name" | "phone" | "geography" | "state" | "district" | "block" | "theme" | "submittedAt" | "statementOfPurpose"
>;

const FIELD_PATTERNS: [Field, RegExp][] = [
  ["ref", /^(ref|reference|application ?(id|no|number|ref(erence)?)|app ?id|id)$/],
  ["email", /e-?mail/],
  ["name", /^(full ?name|name|applicant ?name)$/],
  ["phone", /(mobile|phone)/],
  ["geography", /geograph/],
  ["theme", /theme/],
  ["block", /\bblock\b/],
  ["district", /district/],
  ["state", /\bstate\b/],
  ["submittedAt", /submitted|submission ?date/],
  ["statementOfPurpose", /statement of purpose|^sop$/],
];

const LONG_TEXT = 200;
const WRITTEN_QUESTION = /motivat|why (are|do) you|2[- ]year plan|two[- ]year|difficult|hardest|grassroots work|how did this group|what each member|tell us more|share something/;

function docKind(name: string): Doc["kind"] {
  const n = name.toLowerCase();
  if (/(^|[^a-z])(cv|resume|résumé)([^a-z]|$)/.test(n)) return "cv";
  if (/sop|statement|purpose/.test(n)) return "sop";
  if (/photo/.test(n)) return "photo";
  if (/class ?10|10th|tenth|sslc/.test(n)) return "class10";
  if (/degree|graduat|diploma/.test(n)) return "degree";
  if (/experience|relieving/.test(n)) return "experience";
  return "other";
}

function isUrl(v: string): boolean {
  return /^https:\/\/\S+$/.test(v.trim());
}

export type ImportResult = {
  inputs: ApplicationInput[];
  /** Header → where it went, for the recruiter to check. */
  mapping: { header: string; to: string }[];
  unmatchedFiles: string[];
  errors: string[];
};

export function parseSheet(buf: Buffer, files: { name: string; url: string }[]): ImportResult {
  // Excel files are zip (xlsx) or OLE (xls) containers; anything else is text.
  // Text is decoded as UTF-8 here — SheetJS would otherwise read a CSV as
  // Latin-1 and mangle every dash and non-English name.
  const binary = (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
  const wb = binary
    ? XLSX.read(buf, { type: "buffer", cellDates: true })
    : XLSX.read(buf.toString("utf8").replace(/^\uFEFF/, ""), { type: "string", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  const headers = rows.length ? Object.keys(rows[0]) : [];

  // Decide once per column, from its header and how long its values run.
  const mapping: { header: string; to: string }[] = [];
  const role = new Map<string, { field?: Field; answer?: boolean; docKind?: string }>();
  const taken = new Set<Field>();
  for (const h of headers) {
    const key = h.toLowerCase().trim();
    const field = FIELD_PATTERNS.find(([f, re]) => !taken.has(f) && re.test(key))?.[0];
    const values = rows.map((r) => String(r[h] ?? "")).filter(Boolean);
    const urls = values.length > 0 && values.every(isUrl);
    if (urls) {
      role.set(h, { docKind: docKind(key) });
      mapping.push({ header: h, to: `document (${docKind(key)})` });
    } else if (field) {
      taken.add(field);
      role.set(h, { field });
      mapping.push({ header: h, to: field });
    } else {
      const avg = values.reduce((n, v) => n + v.length, 0) / Math.max(1, values.length);
      // The written questions are recognisable by their wording even when a
      // small export happens to hold short answers.
      const answer = avg >= LONG_TEXT || WRITTEN_QUESTION.test(key) || (/\?$/.test(h.trim()) && avg >= 60);
      role.set(h, { answer });
      mapping.push({ header: h, to: answer ? "written answer" : "form answer" });
    }
  }

  const errors: string[] = [];
  if (!taken.has("ref")) errors.push("No application reference column (e.g. \"Application ID\").");
  if (!taken.has("email")) errors.push("No email column.");
  if (!taken.has("name")) errors.push("No name column.");

  const usedFiles = new Set<string>();
  const inputs: ApplicationInput[] = [];
  rows.forEach((r, i) => {
    const input: ApplicationInput = { ref: "", email: "", name: "", profile: {}, answers: [], documents: [] };
    for (const h of headers) {
      const v = String(r[h] ?? "").trim();
      if (!v) continue;
      const how = role.get(h)!;
      if (how.docKind) input.documents!.push({ kind: how.docKind, name: h, url: v });
      else if (how.field) (input as Record<string, unknown>)[how.field] = v;
      else if (how.answer) input.answers!.push({ key: h.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40), label: h, text: v });
      else input.profile![h] = v;
    }
    if (!input.ref) {
      errors.push(`Row ${i + 2}: no application reference — skipped.`);
      return;
    }
    const groupish = Object.entries(input.profile!).find(([k]) => /individual or (a )?group|applying as/i.test(k));
    if (groupish) input.isGroup = /group/i.test(String(groupish[1]));

    const ref = input.ref.toLowerCase();
    const email = input.email.toLowerCase();
    for (const f of files) {
      const n = f.name.toLowerCase();
      if (n.includes(ref) || (email && n.includes(email))) {
        input.documents!.push({ kind: docKind(f.name), name: f.name, url: f.url });
        usedFiles.add(f.url);
      }
    }
    // A single unlabelled file for an applicant is their CV.
    const unlabelled = input.documents!.filter((d) => d.kind === "other");
    if (unlabelled.length === 1 && !input.documents!.some((d) => d.kind === "cv")) unlabelled[0].kind = "cv";
    inputs.push(input);
  });

  return {
    inputs,
    mapping,
    unmatchedFiles: files.filter((f) => !usedFiles.has(f.url)).map((f) => f.name),
    errors,
  };
}

/** The columns the import understands, as a starter file. */
export const TEMPLATE_HEADERS = [
  "Application ID",
  "Full name",
  "Email",
  "Mobile number",
  "Geography",
  "Theme",
  "State",
  "District",
  "Block",
  "Applying as",
  "Date of birth",
  "Total years of full-time, on-field experience",
  "Years directly with the community",
  "Highest qualification",
  "Current organisation",
  "What motivates you to establish your own organisation, and why now?",
  "Why are you setting up your organisation in the chosen geography, and how did you arrive at this decision?",
  "Please prepare a rough 2-year plan for your organisation",
  "Describe the most difficult grassroots work you have done and what you learnt",
  "Statement of purpose",
  "Submitted at",
];
