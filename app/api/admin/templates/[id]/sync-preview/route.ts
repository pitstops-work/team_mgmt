import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUser } from "@/lib/roleGuard";
import { previewSync } from "@/lib/templateSync";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const preview = await previewSync(id);
  if (!preview) return Response.json({ error: "Template not found" }, { status: 404 });
  return Response.json(preview);
}
