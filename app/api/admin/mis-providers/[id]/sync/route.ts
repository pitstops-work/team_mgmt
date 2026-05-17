import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUser } from "@/lib/roleGuard";
import { runMisSync } from "@/lib/mis-sync";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const result = await runMisSync(id);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
