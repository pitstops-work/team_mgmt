import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest } from "next/server";

export const SUPPORTED_LANGS = [
  { code: "en", label: "English",   native: "English"   },
  { code: "ta", label: "Tamil",     native: "தமிழ்"    },
  { code: "kn", label: "Kannada",   native: "ಕನ್ನಡ"   },
  { code: "ml", label: "Malayalam", native: "മലയാളം"   },
  { code: "hi", label: "Hindi",     native: "हिन्दी"   },
  { code: "bn", label: "Bengali",   native: "বাংলা"    },
] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number]["code"];

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
