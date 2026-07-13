import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import AccountPanel from "./AccountPanel";

// Self-service account page inside the budget shell — usable by partners (who
// are confined to /budget*) and anyone else in the budget area.
export default async function BudgetAccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, preferredLang: true },
  });
  return <AccountPanel email={user?.email ?? ""} name={user?.name ?? null} initialLang={user?.preferredLang ?? "en"} />;
}
