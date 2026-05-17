import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { slugifyChecklistText, type DbPitstop } from "@/lib/templateDb";

type TemplateRow = {
  slug: string;
  name: string;
  domain: string | null;
  pitstops: unknown;
};

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.$queryRaw<TemplateRow[]>`
    SELECT slug, name, "needsDomain" AS domain, pitstops
    FROM "GoalTemplateDef"
    WHERE "isActive" = true
    ORDER BY name
  `;

  const result = rows.map((r) => {
    const pts = (r.pitstops as DbPitstop[]) ?? [];
    const items: { key: string; text: string; pitstopTitle: string }[] = [];
    for (const pt of pts) {
      for (const item of pt.checklist ?? []) {
        const k = (item.key ?? "").trim() || slugifyChecklistText(item.text);
        if (!k) continue;
        items.push({ key: k, text: item.text, pitstopTitle: pt.title });
      }
    }
    return { slug: r.slug, name: r.name, domain: r.domain, items };
  });

  return Response.json(result);
}
