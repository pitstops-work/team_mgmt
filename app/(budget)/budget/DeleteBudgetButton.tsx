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
        try {
          await deleteBudget(budgetId);
        } catch (err) {
          alert(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
        }
      }}
      className="text-xs text-red-500 hover:text-red-700 hover:underline px-1.5 py-0.5 rounded"
    >
      Delete
    </button>
  );
}
