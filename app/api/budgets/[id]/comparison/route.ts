import { auth } from "@/lib/auth";
import { loadCrecheBudgetSnapshot } from "@/lib/review/budget-bridge";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const snapshot = await loadCrecheBudgetSnapshot(id, session.user.id);
    return NextResponse.json(snapshot);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 400 });
  }
}
