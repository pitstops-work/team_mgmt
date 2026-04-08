export const qk = {
  goals: () => ["goals"] as const,
  goal: (id: string) => ["goals", id] as const,
  pitstop: (id: string) => ["pitstops", id] as const,
  notifications: () => ["notifications"] as const,
  people: () => ["people"] as const,
};
