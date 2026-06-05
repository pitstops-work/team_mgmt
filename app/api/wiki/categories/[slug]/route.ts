import { auth } from "@/lib/auth";
import { getCategory } from "@/lib/wiki/articles";
import type { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const programDomain = req.nextUrl.searchParams.get("programDomain") ?? "Elderly";
  const cat = await getCategory(slug, programDomain);
  if (!cat) return Response.json({ error: "Unknown category" }, { status: 404 });
  return Response.json({ category: cat });
}
