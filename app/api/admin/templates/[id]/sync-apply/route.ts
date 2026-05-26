import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUser } from "@/lib/roleGuard";
import { applySync } from "@/lib/templateSync";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const onlyGoalIds: string[] | undefined =
    Array.isArray(body.onlyGoalIds) && body.onlyGoalIds.every((g: unknown) => typeof g === "string")
      ? body.onlyGoalIds
      : undefined;

  const result = await applySync(id, session.user.id, onlyGoalIds ? { onlyGoalIds } : {});
  return Response.json(result);
}
