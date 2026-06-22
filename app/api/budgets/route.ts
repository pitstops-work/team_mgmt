import { auth } from "@/lib/auth";
import { listUserBudgets } from "@/lib/review/budget-bridge";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  // Domain optional — when supplied we filter the user's budgets to that
  // domain (drives the budget_picker dropdown for typed doc types); when
  // omitted we return everything they own.
  const domain = url.searchParams.get("domain") || undefined;
  const budgets = await listUserBudgets(session.user.id, domain);
  return NextResponse.json({ budgets });
}
