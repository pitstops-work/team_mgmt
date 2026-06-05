import { auth } from "@/lib/auth";
import { getForkPanelArticles, PANELS, type Panel } from "@/lib/wiki/articles";
import type { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const panel = req.nextUrl.searchParams.get("panel") as Panel | null;
  if (!panel || !PANELS.includes(panel)) {
    return Response.json({ error: "Invalid panel" }, { status: 400 });
  }

  const { id } = await params;
  const articles = await getForkPanelArticles(id, panel);
  return Response.json({ articles });
}
