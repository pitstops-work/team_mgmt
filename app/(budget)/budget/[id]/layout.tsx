import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isPartner, isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { canAccessBudget } from "@/lib/budget/budgetAccess";
import { resolveGrantSpine } from "@/lib/budget/spine";
import GrantSpine from "./GrantSpine";

/**
 * Every screen of one grant sits under this, so the lifecycle is always above
 * the content rather than something you have to go and find.
 *
 * Access is re-checked here on `read` and the spine is simply omitted when the
 * caller does not hold it — the child page still runs and still does its own
 * (often stricter) check, so a reader who may see reports but not the budget
 * gets the right page either way. A layout must not be the only gate, and it
 * must not be a second, looser one.
 */
export default async function GrantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  const budget = await prisma.budget.findUnique({
    where: { id },
    select: { partnerId: true, grantPartnerId: true },
  });
  if (!budget || !(await canAccessBudget(session, budget, "read"))) {
    return <>{children}</>;
  }

  const audience = isPartner(session) ? "partner" : "internal";
  const spine = await resolveGrantSpine(id, { audience });
  if (!spine) return <>{children}</>;

  const internal = isSuperAdmin(session) || isBudgetAdmin(session);

  return (
    <>
      <GrantSpine
        spine={spine}
        extraLinks={internal ? [{ label: "Analysis", href: `/budget/${id}/analysis` }] : undefined}
      />
      {children}
    </>
  );
}
