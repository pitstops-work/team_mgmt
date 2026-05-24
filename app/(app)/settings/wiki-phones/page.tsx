import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { redirect } from "next/navigation";
import WikiPhonesView from "./WikiPhonesView";

export default async function WikiPhonesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const steward = await isWikiSteward(userId);
  if (!steward) {
    return (
      <main className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-stone-600 text-sm">
          Only wiki stewards can manage phone numbers.
        </div>
      </main>
    );
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      whatsappOptIn: true,
      designation: true,
    },
    orderBy: { name: "asc" },
  });

  return <WikiPhonesView initialUsers={JSON.parse(JSON.stringify(users))} />;
}
