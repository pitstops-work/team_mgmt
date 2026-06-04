import prisma from "../lib/prisma";

async function main() {
  const templates = await prisma.goalTemplateDef.findMany({
    select: { slug: true, name: true, linkedFacilityLayerKey: true, isActive: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  console.log(`\n${templates.length} templates total. Existing/facility-linked breakdown:\n`);

  const hasLayer: typeof templates = [];
  const existingNoLayer: typeof templates = [];
  const newTemplates: typeof templates = [];
  for (const t of templates) {
    const isExisting = t.name.toLowerCase().includes("existing");
    if (t.linkedFacilityLayerKey) hasLayer.push(t);
    else if (isExisting) existingNoLayer.push(t);
    else newTemplates.push(t);
  }

  console.log(`✓ Templates WITH linkedFacilityLayerKey (already get multi-select + stagger):`);
  for (const t of hasLayer) {
    console.log(`    ${t.isActive ? "" : "[inactive] "}${t.slug.padEnd(35)}  layer=${t.linkedFacilityLayerKey}  "${t.name}"`);
  }

  console.log(`\n⚠ "Existing" templates WITHOUT linkedFacilityLayerKey (would need to set one):`);
  for (const t of existingNoLayer) {
    console.log(`    ${t.isActive ? "" : "[inactive] "}${t.slug.padEnd(35)}  "${t.name}"`);
  }

  console.log(`\n(For reference — non-"existing" templates: ${newTemplates.length})`);
}
main().finally(() => prisma.$disconnect());
