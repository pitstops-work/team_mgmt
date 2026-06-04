import { redirect } from "next/navigation";

/**
 * /partners moved into /settings/partners as part of the 2026-06-04 Org
 * consolidation. This stub preserves any external links / bookmarks.
 */
export default function PartnersRedirect() {
  redirect("/settings/partners");
}
