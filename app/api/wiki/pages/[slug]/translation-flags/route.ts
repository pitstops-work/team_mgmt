import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { NextRequest } from "next/server";

const SUPPORTED_LANGS = new Set(["en", "ta", "kn", "ml", "hi", "bn"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!page) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const language = typeof body.language === "string" ? body.language : "";
  if (!SUPPORTED_LANGS.has(language)) {
    return Response.json({ error: "Unsupported language" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return Response.json({ error: "reason required" }, { status: 400 });

  const flag = await prisma.wikiTranslationFlag.create({
    data: {
      pageId: page.id,
      language,
      flaggerId: userId,
      reason,
      status: "open",
    },
    select: { id: true },
  });

  return Response.json({ flag }, { status: 201 });
}
