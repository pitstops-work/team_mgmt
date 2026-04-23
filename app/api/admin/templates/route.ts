import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export async function GET() {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.$queryRaw<unknown[]>`
    SELECT id, slug, name, description, category, icon, "needsDomain",
           "sortOrder", parameters, pitstops, "isActive", "createdAt", "updatedAt"
    FROM "GoalTemplateDef"
    ORDER BY "sortOrder" ASC, name ASC
  `;
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { slug, name, description, category, icon, needsDomain, sortOrder, parameters, pitstops } = body;

  if (!slug || !name || !category) {
    return Response.json({ error: "slug, name, and category are required" }, { status: 400 });
  }

  // Check slug uniqueness
  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "GoalTemplateDef" WHERE slug = ${slug} LIMIT 1
  `;
  if (existing.length > 0) {
    return Response.json({ error: "A template with this slug already exists" }, { status: 409 });
  }

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "GoalTemplateDef"
      (slug, name, description, category, icon, "needsDomain", "sortOrder", parameters, pitstops, "isActive", "updatedAt")
    VALUES (
      ${slug},
      ${name},
      ${description ?? ""},
      ${category},
      ${icon ?? "🎯"},
      ${needsDomain ?? null},
      ${sortOrder ?? 99},
      ${JSON.stringify(parameters ?? [])}::jsonb,
      ${JSON.stringify(pitstops ?? [])}::jsonb,
      true,
      NOW()
    )
    RETURNING id
  `;

  return Response.json({ id: rows[0]?.id }, { status: 201 });
}
