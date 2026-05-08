import NewBudgetForm from "./NewBudgetForm";

export default function NewBudgetPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900">New Budget</h1>
        <p className="text-sm text-stone-500 mt-1">Select domains and enter programme scale to auto-generate a draft APF budget.</p>
      </div>
      <NewBudgetForm />
    </div>
  );
}
