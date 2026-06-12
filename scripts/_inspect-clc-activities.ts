import prisma from "../lib/prisma";

async function main() {
  const t = await prisma.goalTemplateDef.findUnique({ where: { slug: "children-learning-centre" } });
  if (!t) return;
  const ps = t.pitstops as Array<{
    title: string; type: string; startSlaDays: number; slaDays: number; progressTag: string;
    checklist: Array<{ text: string; activities?: Array<{ title: string; dayOffset: number; completionType: string }> }>;
  }>;

  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    console.log(`\n═══ ${i + 1}. ${p.title}  [${p.startSlaDays}→${p.slaDays}] type=${p.type} tag=${p.progressTag} ═══`);
    for (const ci of p.checklist) {
      for (const a of ci.activities ?? []) {
        console.log(`  • ${ci.text}`);
        console.log(`    ↳ "${a.title}"  day+${a.dayOffset}  [${a.completionType}]`);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
