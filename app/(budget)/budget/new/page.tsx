import prisma from "@/lib/prisma";
import NewBudgetForm from "./NewBudgetForm";

// Standard inp.* keys that already have hardcoded form fields
const STANDARD_INP_KEYS = new Set([
  "inp.nSettlements", "inp.nClusters", "inp.cosPerCluster", "inp.cosTotal",
  "inp.nCLCs", "inp.clcRentPerMonth",
  "inp.nYRCs", "inp.yrcRentPerMonth",
  "inp.nElderlyCentres", "inp.nElderly", "inp.elderlyCentreRentPerMonth",
  "inp.nCreches", "inp.crecheRentPerMonth",
  "inp.rcRentPerMonth",
]);

export type CustomProgrammeInput = {
  key: string;       // without inp. prefix — used as extraInputs key and inputVar
  label: string;
  unit: string;
  defaultValue: number;
  city: string;
};

export default async function NewBudgetPage() {
  const rows = await prisma.costRegistry.findMany({
    where: { itemKey: { startsWith: "inp." } },
    orderBy: { itemKey: "asc" },
  });

  const customInputs: CustomProgrammeInput[] = rows
    .filter(r => !STANDARD_INP_KEYS.has(r.itemKey))
    .map(r => ({
      key: r.itemKey.slice(4), // strip "inp."
      label: r.notes ?? r.itemKey.slice(4).replace(/_/g, " "),
      unit: r.unit,
      defaultValue: r.unitCost,
      city: r.city,
    }));

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900">New Budget</h1>
        <p className="text-sm text-stone-500 mt-1">Select domains and enter programme scale to auto-generate a draft APF budget.</p>
      </div>
      <NewBudgetForm customInputs={customInputs} />
    </div>
  );
}
