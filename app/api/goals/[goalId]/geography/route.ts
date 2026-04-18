import { NextResponse } from "next/server";

// Geography M2M tagging removed in migration 0036 (unified settlement DB).
// Goals now reference a single settlement/cluster/zone via needsSettlementId,
// needsClusterId, needsZoneId on the Goal model.
export async function GET() {
  return NextResponse.json({ zones: [], clusters: [], settlements: [] });
}
export async function POST() {
  return NextResponse.json({ error: "Deprecated" }, { status: 410 });
}
export async function DELETE() {
  return NextResponse.json({ error: "Deprecated" }, { status: 410 });
}
