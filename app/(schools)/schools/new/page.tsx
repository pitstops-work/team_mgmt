import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSchoolPlanAccess } from "@/lib/schoolPlan/access";
import { createPlan } from "../actions";

export default async function NewSchoolPlanPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!access.canManageStructure) redirect("/schools");

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-lg font-semibold text-stone-900">New school plan</h1>
      <p className="text-xs text-stone-500">
        Creates a school with the 16-step template + default services + programme components. Fill the rest from the plan's edit page.
      </p>
      <form action={createPlan} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
        <label className="block">
          <span className="block text-xs font-medium text-stone-700 mb-1">Short name *</span>
          <input name="name" required className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder="e.g. Yelahanka" />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-stone-700 mb-1">Official name</span>
          <input name="officialName" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder="Moulana Azad Model School, …" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-stone-700 mb-1">Taluk</span>
            <input name="taluk" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-stone-700 mb-1">District</span>
            <input name="district" defaultValue="Bangalore Urban" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-stone-700 mb-1">Target children/day</span>
          <input name="targetChildrenPerDay" type="number" min={0} defaultValue={300} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <span className="text-[10px] text-stone-400">Standard 300/day (drives food-cost scaling).</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <a href="/schools" className="text-xs px-3 py-1.5 rounded-full border border-stone-200 text-stone-700 hover:bg-stone-50">Cancel</a>
          <button type="submit" className="text-xs px-3 py-1.5 rounded-full bg-sky-500 text-white hover:bg-sky-600">Create plan</button>
        </div>
      </form>
    </div>
  );
}
