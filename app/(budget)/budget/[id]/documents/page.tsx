import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { getPartnerAccess, partnerCanAccessBudget } from "@/lib/budget/partnerAccess";
import { documentsFor, requirementStatus } from "@/lib/budget/documents";
import DocumentsPanel from "./DocumentsPanel";

/**
 * Every document on one grant, for whoever is looking.
 *
 * The audience filter is applied in the QUERY, not in the component: an
 * internal-only document must never enter the payload the page is built from,
 * because an RSC payload is shipped to the browser whether or not anything
 * renders it. Filtering in JSX would hide the row and send the bytes.
 */
export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const budget = await prisma.budget.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      partnerId: true,
      grantPartnerId: true,
      grantPartner: { select: { name: true } },
    },
  });
  if (!budget) notFound();

  const canReview = isSuperAdmin(session) || isBudgetAdmin(session);
  const partnerAccess = await getPartnerAccess(session);
  const isGrantee = partnerCanAccessBudget(partnerAccess, budget);
  const isOwner = budget.partnerId === session?.user?.id;
  if (!canReview && !isGrantee && !isOwner) notFound();

  const audience = canReview ? "internal" : "partner";

  const [documents, requirements] = await Promise.all([
    documentsFor(id, { audience, includeSuperseded: true }),
    requirementStatus(id),
  ]);

  return (
    <DocumentsPanel
      budgetId={id}
      budgetName={budget.name}
      granteeName={budget.grantPartner?.name ?? null}
      audience={audience}
      documents={JSON.parse(JSON.stringify(documents))}
      requirements={JSON.parse(JSON.stringify(requirements))}
    />
  );
}
