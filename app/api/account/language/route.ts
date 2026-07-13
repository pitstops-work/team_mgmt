import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest } from "next/server";
import { viewerForbidden } from "@/lib/roleGuard";
import { SUPPORTED_LANGS } from "@/lib/langs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { preferredLang: true },
  });

  return Response.json({ lang: user?.preferredLang ?? "en" });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = viewerForbidden(session); if (veto) return veto;

  const { lang } = await req.json();
  const valid = SUPPORTED_LANGS.map((l) => l.code);
  if (!valid.includes(lang)) {
    return Response.json({ error: "Invalid language code" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { preferredLang: lang },
  });

  return Response.json({ lang });
}
