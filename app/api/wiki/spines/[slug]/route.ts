import { auth } from "@/lib/auth";
import { getSpineBySlug } from "@/lib/wiki/articles";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { slug } = await params;
  const spine = await getSpineBySlug(slug);
  if (!spine) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ spine });
}
