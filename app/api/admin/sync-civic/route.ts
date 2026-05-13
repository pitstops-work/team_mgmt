import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roleGuard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// ── Normalisation helpers ─────────────────────────────────────────────────────

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bg = (str: string) => {
    const set = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) set.add(str.slice(i, i + 2));
    return set;
  };
  const ba = bg(a), bb = bg(b);
  let shared = 0;
  for (const g of ba) if (bb.has(g)) shared++;
  return (2 * shared) / (ba.size + bb.size);
}

// ── Compute % breakdown from group rows ──────────────────────────────────────

type GroupRow = { item: string; count: number };

function pctBreakdown(rows: GroupRow[]): Record<string, number> {
  // Merge duplicate items (different partners reporting same slum)
  const merged: Record<string, number> = {};
  for (const r of rows) {
    // Normalise item names: strip comma-duplicates e.g. "Sewerage,Sewerage" → "Sewerage"
    const item = r.item.split(",")[0].trim();
    merged[item] = (merged[item] ?? 0) + r.count;
  }
  const total = Object.values(merged).reduce((s, v) => s + v, 0);
  if (total === 0) return {};
  const out: Record<string, number> = {};
  for (const [item, count] of Object.entries(merged)) {
    out[item] = Math.round((count / total) * 1000) / 10; // one decimal place
  }
  return out;
}

function mapKeys(raw: Record<string, number>, group: string): Record<string, number> {
  const keyMap: Record<string, Record<string, string>> = {
    Borewell: {
      Individual: "individual", Public: "public", Shared: "shared",
      "Private Tanker": "privateTanker", NA: "na",
    },
    "Toilet Connection": {
      Sewerage: "sewerage", "Soak pit": "soakPit", "No Sewerage": "noSewerage",
    },
    "Toilet Facility": {
      Individual: "individual", Shared: "shared", Public: "public",
      "Public paid facility": "publicPaid", "No toilet facility": "noFacility",
    },
    "Water Supply": {
      Individual: "individual", Shared: "shared", Public: "public",
      "Private Tanker": "privateTanker",
    },
  };
  const map = keyMap[group] ?? {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const mapped = map[k];
    if (mapped) out[mapped] = v;
  }
  return out;
}

// ── Need scores (0-100, higher = more need) ───────────────────────────────────

function needScore(group: string, data: Record<string, number>): number {
  switch (group) {
    case "Borewell":           return 100 - (data.individual ?? 0);
    case "Toilet Connection":  return (data.soakPit ?? 0) + (data.noSewerage ?? 0);
    case "Toilet Facility":    return 100 - (data.individual ?? 0);
    case "Water Supply":       return 100 - (data.individual ?? 0);
    default:                   return 0;
  }
}

// ── Main POST handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !isSuperAdmin(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { token: rawToken } = await req.json().catch(() => ({}));
  if (!rawToken) return Response.json({ error: "token required" }, { status: 400 });

  // Accept either the full URL or just the token value
  let token = rawToken.trim();
  if (token.startsWith("http")) {
    try { token = new URL(token).searchParams.get("token") ?? token; } catch {}
  }

  // 1. Fetch janadhikara data
  const res = await fetch(
    `https://janadhikara.org/backend/api/multi_filter_report/9?token=${encodeURIComponent(token)}`
  );
  if (!res.ok) return Response.json({ error: "Janadhikara fetch failed", status: res.status }, { status: 502 });

  const { items } = await res.json() as { items: { slum_id: number; Slum_Name: string; Zone_Name: string; Group: string; Item: string; Count: number }[] };

  // 2. Build per-slum map
  const janaMap = new Map<number, { id: number; name: string; zone: string; groups: Record<string, GroupRow[]> }>();
  for (const i of items) {
    if (!janaMap.has(i.slum_id)) {
      janaMap.set(i.slum_id, { id: i.slum_id, name: i.Slum_Name, zone: i.Zone_Name, groups: {} });
    }
    const s = janaMap.get(i.slum_id)!;
    if (!s.groups[i.Group]) s.groups[i.Group] = [];
    s.groups[i.Group].push({ item: i.Item, count: i.Count });
  }
  const janaList = [...janaMap.values()];

  // 3. Fetch all our settlements
  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  // 4. Match settlements to janadhikara slums
  let matched = 0, skipped = 0;

  for (const s of settlements) {
    const sn = norm(s.name);
    let best: typeof janaList[number] | null = null;
    let bestScore = 0;
    for (const j of janaList) {
      const score = dice(sn, norm(j.name));
      if (score > bestScore) { bestScore = score; best = j; }
    }

    if (!best || bestScore < 0.65) { skipped++; continue; }

    // 5. Compute % breakdowns and need scores for all 4 groups
    const civic: {
      janaId: number;
      borewell: Record<string, number> | null;
      toiletConnection: Record<string, number> | null;
      toiletFacility: Record<string, number> | null;
      waterSupply: Record<string, number> | null;
      borewellNeedScore: number | null;
      toiletConnNeedScore: number | null;
      toiletFacNeedScore: number | null;
      waterSupplyNeedScore: number | null;
    } = {
      janaId: best.id,
      borewell: null, toiletConnection: null, toiletFacility: null, waterSupply: null,
      borewellNeedScore: null, toiletConnNeedScore: null, toiletFacNeedScore: null, waterSupplyNeedScore: null,
    };

    const groupMappings: [string, keyof typeof civic][] = [
      ["Borewell", "borewell"],
      ["Toilet Connection", "toiletConnection"],
      ["Toilet Facility", "toiletFacility"],
      ["Water Supply", "waterSupply"],
    ];
    const scoreMappings: [string, keyof typeof civic][] = [
      ["Borewell", "borewellNeedScore"],
      ["Toilet Connection", "toiletConnNeedScore"],
      ["Toilet Facility", "toiletFacNeedScore"],
      ["Water Supply", "waterSupplyNeedScore"],
    ];

    for (const [group, field] of groupMappings) {
      const rows = best.groups[group];
      if (rows?.length) {
        const raw = pctBreakdown(rows);
        (civic as Record<string, unknown>)[field] = mapKeys(raw, group);
      }
    }
    const groupToField: Record<string, keyof typeof civic> = {
      "Borewell": "borewell", "Toilet Connection": "toiletConnection",
      "Toilet Facility": "toiletFacility", "Water Supply": "waterSupply",
    };
    const scoreFieldMap: Record<string, keyof typeof civic> = {
      "Borewell": "borewellNeedScore", "Toilet Connection": "toiletConnNeedScore",
      "Toilet Facility": "toiletFacNeedScore", "Water Supply": "waterSupplyNeedScore",
    };
    for (const [group, scoreField] of scoreMappings) {
      const dataField = groupToField[group];
      const d = civic[dataField] as Record<string, number> | null;
      if (d) {
        (civic as Record<string, unknown>)[scoreField as string] = Math.round(needScore(group, d) * 10) / 10;
      }
    }
    void scoreFieldMap; // used for clarity only

    await prisma.settlementCivicData.upsert({
      where: { settlementId: s.id },
      create: {
        settlementId: s.id, syncedAt: new Date(),
        janaId: civic.janaId,
        borewell: civic.borewell ?? undefined,
        toiletConnection: civic.toiletConnection ?? undefined,
        toiletFacility: civic.toiletFacility ?? undefined,
        waterSupply: civic.waterSupply ?? undefined,
        borewellNeedScore: civic.borewellNeedScore,
        toiletConnNeedScore: civic.toiletConnNeedScore,
        toiletFacNeedScore: civic.toiletFacNeedScore,
        waterSupplyNeedScore: civic.waterSupplyNeedScore,
      },
      update: {
        syncedAt: new Date(),
        janaId: civic.janaId,
        borewell: civic.borewell ?? undefined,
        toiletConnection: civic.toiletConnection ?? undefined,
        toiletFacility: civic.toiletFacility ?? undefined,
        waterSupply: civic.waterSupply ?? undefined,
        borewellNeedScore: civic.borewellNeedScore,
        toiletConnNeedScore: civic.toiletConnNeedScore,
        toiletFacNeedScore: civic.toiletFacNeedScore,
        waterSupplyNeedScore: civic.waterSupplyNeedScore,
      },
    });
    matched++;
  }

  // 6. Upsert the 4 NeedsFormulaConfig domains if they don't exist yet
  const civicDomains = [
    { domain: "Borewell",         label: "Borewell",          color: "#0ea5e9", civicGroup: "borewell",         sortBase: 50 },
    { domain: "ToiletConnection", label: "Toilet Connection",  color: "#f97316", civicGroup: "toiletConnection", sortBase: 51 },
    { domain: "ToiletFacility",   label: "Toilet Facility",    color: "#8b5cf6", civicGroup: "toiletFacility",   sortBase: 52 },
    { domain: "WaterSupply",      label: "Water Supply",       color: "#06b6d4", civicGroup: "waterSupply",      sortBase: 53 },
  ];

  const max = await prisma.needsFormulaConfig.findFirst({ orderBy: { sortOrder: "desc" } });
  let nextSort = (max?.sortOrder ?? 49) + 1;

  for (const cd of civicDomains) {
    await prisma.needsFormulaConfig.upsert({
      where: { domain: cd.domain },
      create: {
        domain: cd.domain, label: cd.label, color: cd.color,
        domainType: "civic", civicGroup: cd.civicGroup,
        sortOrder: nextSort++, isActive: true, assessmentLevel: "settlement",
      },
      update: { label: cd.label, color: cd.color, domainType: "civic", civicGroup: cd.civicGroup },
    });
  }

  return Response.json({ matched, skipped, total: settlements.length });
}
