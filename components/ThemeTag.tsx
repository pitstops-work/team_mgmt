import { Tag } from "lucide-react";

type Theme = { id: string; name: string; color: string | null };

export default function ThemeTag({ theme }: { theme: Theme }) {
  const bg = theme.color ? `${theme.color}20` : "#f1f5f9";
  const text = theme.color ?? "#64748b";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ backgroundColor: bg, color: text, borderColor: `${theme.color ?? "#94a3b8"}40` }}
    >
      <Tag className="w-2.5 h-2.5" />
      {theme.name}
    </span>
  );
}
