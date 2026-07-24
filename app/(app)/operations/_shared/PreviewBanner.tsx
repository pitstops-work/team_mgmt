import Link from "next/link";
import { Eye, X } from "lucide-react";

/**
 * Sticky "Viewing as <name>" banner shown when a super-admin previews another
 * user's Operations view via ?asUser. `exitHref` points back at the same page
 * without the param.
 */
export function PreviewBanner({ name, exitHref }: { name: string | null; exitHref: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <Eye className="w-3.5 h-3.5" />
        Viewing as {name ?? "user"} · read-only preview
      </span>
      <Link href={exitHref} className="flex items-center gap-1 text-[11px] text-amber-700 hover:text-amber-900">
        <X className="w-3 h-3" /> Exit
      </Link>
    </div>
  );
}
