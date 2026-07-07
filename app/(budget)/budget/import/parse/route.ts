import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { parseBudgetWorkbook, BudgetImportError } from "@/lib/budget/importTemplate";
import { createBudgetFromImport } from "../../actions";

// POST a filled budget .xlsx (multipart field "file").
//   default      → parse only, returns the preview (ParsedBudget).
//   commit=1     → parse + create the budget, returns { id }.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 15 MB)." }, { status: 400 });

  let parsed;
  try {
    parsed = await parseBudgetWorkbook(await file.arrayBuffer());
  } catch (e) {
    if (e instanceof BudgetImportError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: "Could not parse the workbook." }, { status: 422 });
  }

  if (form.get("commit") === "1") {
    try {
      const city = typeof form.get("city") === "string" ? (form.get("city") as string) : undefined;
      const gp = form.get("grantPartnerId");
      const grantPartnerId = typeof gp === "string" && gp ? gp : null;
      const { id } = await createBudgetFromImport(parsed, { city, grantPartnerId });
      return NextResponse.json({ id });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message || "Could not create the budget." }, { status: 500 });
    }
  }

  return NextResponse.json({ preview: parsed });
}
