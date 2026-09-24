/** GET — an empty CSV with the columns the screening import understands. */

import { TEMPLATE_HEADERS } from "@/lib/seeding/screening/importSheet";

export async function GET() {
  const csv = TEMPLATE_HEADERS.map((h) => `"${h.replace(/"/g, '""')}"`).join(",") + "\n";
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="screening-import-template.csv"' },
  });
}
