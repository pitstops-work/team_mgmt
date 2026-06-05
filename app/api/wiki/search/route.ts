import { auth } from "@/lib/auth";
import { searchArticles } from "@/lib/wiki/articles";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const programDomain = req.nextUrl.searchParams.get("programDomain") ?? undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "20");
  const results = await searchArticles(q, programDomain, Math.min(50, Math.max(1, limit)));
  return Response.json({ results });
}
