// Deterministic chip colours for role badges. Derived from the role name so any
// role — existing or newly added — gets a stable colour with zero per-role
// hardcoding. Client-safe (no imports).
const ROLE_PALETTE = [
  "bg-amber-100 text-amber-700",
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-teal-100 text-teal-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-lime-100 text-lime-700",
  "bg-cyan-100 text-cyan-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

export function roleStyle(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ROLE_PALETTE[h % ROLE_PALETTE.length];
}
