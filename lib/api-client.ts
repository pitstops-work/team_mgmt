// Client-side fetch helpers used by React Query
export async function fetchGoals() {
  const res = await fetch("/api/goals");
  if (!res.ok) throw new Error("Failed to fetch goals");
  return res.json();
}

export async function fetchGoal(goalId: string) {
  const res = await fetch(`/api/goals/${goalId}`);
  if (!res.ok) throw new Error("Failed to fetch goal");
  return res.json();
}
