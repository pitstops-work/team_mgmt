/**
 * Dump CLC + YRC GoalTemplateDef rows side-by-side. Used to plan a YRC
 * rewrite that mirrors the recently-redone CLC pattern.
 *
 * Usage: pnpm tsx scripts/_inspect-clc-yrc.ts
 */
import prisma from "../lib/prisma";

type ChecklistItem = {
  text?: string;
  key?: string;
  activityTitle?: string;
  completionType?: string;
  offsetDays?: number;
  description?: string;
  [k: string]: unknown;
};

type Pitstop = {
  title?: string;
  type?: string;
  notes?: string;
  description?: string;
  slaDays?: number;
  startSlaDays?: number;
  recurrence?: string;
  progressTag?: string;
  templateKey?: string;
  checklist?: ChecklistItem[];
  [k: string]: unknown;
};

function fmt(p: Pitstop, i: number): string {
  const lines: string[] = [];
  const slaStr = p.startSlaDays !== undefined || p.slaDays !== undefined
    ? `[start=${p.startSlaDays ?? "—"} sla=${p.slaDays ?? "—"}]`
    : "";
  lines.push(`  ${i + 1}. ${p.title ?? "(no title)"}  ${slaStr}  rec=${p.recurrence ?? "None"}  tag=${p.progressTag ?? "—"}  templateKey=${p.templateKey ?? "—"}`);
  if (p.description || p.notes) lines.push(`     desc: ${(p.description ?? p.notes ?? "").slice(0, 220)}`);
  if (Array.isArray(p.checklist) && p.checklist.length > 0) {
    lines.push(`     checklist (${p.checklist.length}):`);
    for (const ci of p.checklist) {
      const offset = ci.offsetDays !== undefined ? ` +${ci.offsetDays}d` : "";
      const ct = ci.completionType ? ` [${ci.completionType}]` : "";
      const k = ci.key ? ` {${ci.key}}` : "";
      const act = ci.activityTitle ? `  ↳ activity: "${ci.activityTitle}"` : "";
      lines.push(`       • ${ci.text ?? "(no text)"}${ct}${k}${offset}${act}`);
      if (ci.description) lines.push(`         desc: ${String(ci.description).slice(0, 200)}`);
    }
  }
  return lines.join("\n");
}

async function dump(slug: string) {
  const t = await prisma.goalTemplateDef.findUnique({ where: { slug } });
  if (!t) {
    console.log(`\n=== ${slug} — NOT FOUND ===\n`);
    return;
  }
  console.log(`\n${"═".repeat(80)}`);
  console.log(`=== ${slug}  "${t.name}"  ${t.isActive ? "" : "[INACTIVE]"}`);
  console.log(`${"═".repeat(80)}`);
  console.log(`category: ${t.category}    domain: ${t.needsDomain ?? "—"}    facilityLayer: ${t.linkedFacilityLayerKey ?? "—"}    sortOrder: ${t.sortOrder}`);
  console.log(`description: ${t.description}`);
  const params = Array.isArray(t.parameters) ? t.parameters : [];
  if (params.length > 0) {
    console.log(`parameters (${params.length}):`);
    for (const p of params as Record<string, unknown>[]) {
      console.log(`  - ${p.key}: ${p.label ?? ""} (${p.type ?? ""})${p.options ? `  options=${JSON.stringify(p.options)}` : ""}`);
    }
  }
  const pitstops = Array.isArray(t.pitstops) ? (t.pitstops as Pitstop[]) : [];
  console.log(`\npitstops (${pitstops.length}):`);
  pitstops.forEach((p, i) => console.log(fmt(p, i)));
  console.log(`updatedAt: ${t.updatedAt.toISOString()}`);
}

async function dumpRaw(slug: string) {
  const t = await prisma.goalTemplateDef.findUnique({ where: { slug } });
  if (!t) return;
  const ps = Array.isArray(t.pitstops) ? (t.pitstops as Pitstop[]) : [];
  if (ps[0]) {
    console.log(`\n=== ${slug} — first pitstop RAW shape ===`);
    console.log("keys:", Object.keys(ps[0]));
    console.log("checklist[0] keys:", Object.keys((ps[0].checklist?.[0] ?? {}) as object));
    console.log(JSON.stringify(ps[0], null, 2));
  }
}

async function main() {
  await dump("children-learning-centre");
  await dump("children-learning-centre-existing");
  await dump("youth-resource-centre");
  await dump("youth-resource-centre-existing");
  await dumpRaw("children-learning-centre");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
