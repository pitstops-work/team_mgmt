import { auth } from "@/lib/auth";
import { listUserBudgets } from "@/lib/review/budget-bridge";
import { getAssembly } from "@/lib/approvals/repo";
import { approvalBudgetScope } from "@/lib/partners/approvalScope";
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

  // forApproval narrows the list to the grantee that approval is about, so a
  // reviewer cannot confirm one organisation's approval against another
  // organisation's budget. `partner`/`scoped` come back so the picker can say
  // whose budgets it is showing — an empty list for a real partner means that
  // partner has no budgets, which is worth stating rather than looking broken.
  const forApproval = url.searchParams.get("forApproval") || undefined;
  if (forApproval) {
    const asm = await getAssembly(forApproval);
    if (!asm) return NextResponse.json({ error: "approval not found" }, { status: 404 });
    const scope = await approvalBudgetScope(asm.org_id);
    const budgets = await listUserBudgets(
      session.user.id,
      domain,
      scope.scoped ? scope.grantPartnerIds : undefined,
    );
    return NextResponse.json({
      budgets,
      scoped: scope.scoped,
      partner: scope.partner ? { id: scope.partner.id, name: scope.partner.name } : null,
    });
  }

  const budgets = await listUserBudgets(session.user.id, domain);
  return NextResponse.json({ budgets, scoped: false, partner: null });
}
