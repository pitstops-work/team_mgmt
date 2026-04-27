import prisma from "@/lib/prisma";

export async function GET() {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      slug: string;
      name: string;
      description: string;
      category: string;
      icon: string;
      needsDomain: string | null;
      linkedFacilityLayerKey: string | null;
      parameters: unknown;
    }[]
  >`
    SELECT id, slug, name, description, category, icon, "needsDomain", "linkedFacilityLayerKey", parameters
    FROM "GoalTemplateDef"
    WHERE "isActive" = true
    ORDER BY "sortOrder" ASC, name ASC
  `;

  const list = rows.map((r) => ({
    id: r.slug,  // keep slug as id for backward compat with TemplatePickerModal
    name: r.name,
    description: r.description,
    category: r.category,
    icon: r.icon,
    needsDomain: r.needsDomain ?? null,
    linkedFacilityLayerKey: r.linkedFacilityLayerKey ?? null,
    parameters: r.parameters,
  }));

  return Response.json(list);
}
