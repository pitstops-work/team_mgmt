import { redirect } from "next/navigation";
import ScreeningNav from "../_components/ScreeningNav";
import { pageAccess } from "../_lib/load";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ScreeningImportPage() {
  const s = await pageAccess();
  if (!s || !(s.all || s.canConfigure)) redirect("/seeding/screening");
  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-900">Import applications</h1>
      <p className="text-sm text-stone-500 mb-4">
        For use until the application portal sends applications directly. Re-importing an application updates it; reviews
        already recorded are kept.
      </p>
      <ScreeningNav active="import" canImport canConfigure={s.canConfigure} />
      <ImportClient />
    </div>
  );
}
