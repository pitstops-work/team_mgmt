import { auth } from "@/lib/auth";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { getPartnerAccess, partnerCanAccessBudget } from "@/lib/budget/partnerAccess";
import prisma from "@/lib/prisma";
import { getDownloadUrl } from "@vercel/blob";

// Streams the signed & sealed declaration scan (stored private) to the partner
// who owns the budget or a budget reviewer.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; slotId: string }> },
) {
  const { id, slotId } = await params;
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: { budgetId: true, report: { select: { declarationSignedScanUrl: true } } },
  });
  const budget = await prisma.budget.findUnique({ where: { id }, select: { partnerId: true, grantPartnerId: true } });
  if (!slot || !budget || slot.budgetId !== id) return Response.json({ error: "Not found" }, { status: 404 });

  const access = await getPartnerAccess(session);
  const allowed = budget.partnerId === session.user.id || isSuperAdmin(session) || isBudgetAdmin(session) || partnerCanAccessBudget(access, budget);
  if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });

  const url = slot.report?.declarationSignedScanUrl;
  if (!url) return Response.json({ error: "No scan on file" }, { status: 404 });

  return Response.redirect(getDownloadUrl(url));
}
