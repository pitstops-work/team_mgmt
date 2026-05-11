'use client';

import { deleteBudget } from './actions';

export default function DeleteBudgetButton({ budgetId }: { budgetId: string }) {
  return (
    <button
      type="button"
      onClick={async e => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Delete this budget? This cannot be undone.')) return;
        await deleteBudget(budgetId);
      }}
      className="text-xs text-stone-300 hover:text-red-500 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
    >
      ✕
    </button>
  );
}
