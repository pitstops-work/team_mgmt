import { auth } from "@/lib/auth";
import { listUserCrecheBudgets } from "@/lib/review/budget-bridge";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain");
  if (domain !== "Creche") {
    return NextResponse.json({ error: "only domain=Creche is supported" }, { status: 400 });
  }
  const budgets = await listUserCrecheBudgets(session.user.id);
  return NextResponse.json({ budgets });
}
