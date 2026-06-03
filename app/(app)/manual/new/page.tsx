import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isWikiSteward } from "@/lib/wiki/auth";
import NewManualForm from "./NewManualForm";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function NewManualPage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) redirect("/login");

  const steward = await isWikiSteward(userId);
  if (!steward) redirect("/manual");

  return (
    <SurfaceProvider id="manual.new">
      <NewManualForm />
    </SurfaceProvider>
  );
}
