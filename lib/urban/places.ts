// Places and partners: copied once (and refreshable) from the existing
// geography and partner registry. Safe to run repeatedly — rows are matched on
// (level, legacyId) / legacyOrgId, so a re-run updates names and parents,
// adds new rows, and marks rows whose source was deleted as inactive. Places
// made here (sites) have no legacyId and are never touched by an import.
import prisma from "@/lib/prisma";
import { logEvent } from "./events";

type Src = { legacyId: string; level: "city" | "zone" | "cluster" | "settlement"; name: string; parentLegacy: { level: string; id: string } | null; lat?: number | null; lng?: number | null; deleted: boolean };

export type ImportSummary = { added: number; updated: number; deactivated: number; skipped: string[] };

export async function importPlaces(actorId: string): Promise<ImportSummary> {
  const [cities, zones, clusters, settlements] = await Promise.all([
    prisma.city.findMany({ select: { id: true, name: true, deletedAt: true } }),
    prisma.zone.findMany({ select: { id: true, name: true, cityId: true, deletedAt: true } }),
    prisma.cluster.findMany({ select: { id: true, name: true, zoneId: true, deletedAt: true } }),
    prisma.settlement.findMany({ select: { id: true, name: true, clusterId: true, centroidLat: true, centroidLng: true, deletedAt: true } }),
  ]);

  const skipped: string[] = [];
  const src: Src[] = [
    ...cities.map((c) => ({ legacyId: c.id, level: "city" as const, name: c.name, parentLegacy: null, deleted: !!c.deletedAt })),
    ...zones.flatMap((z) => {
      if (!z.cityId) { if (!z.deletedAt) skipped.push(`Zone "${z.name}" has no city`); return []; }
      return [{ legacyId: z.id, level: "zone" as const, name: z.name, parentLegacy: { level: "city", id: z.cityId }, deleted: !!z.deletedAt }];
    }),
    ...clusters.map((c) => ({ legacyId: c.id, level: "cluster" as const, name: c.name, parentLegacy: { level: "zone", id: c.zoneId }, deleted: !!c.deletedAt })),
    ...settlements.map((s) => ({ legacyId: s.id, level: "settlement" as const, name: s.name, parentLegacy: { level: "cluster", id: s.clusterId }, lat: s.centroidLat, lng: s.centroidLng, deleted: !!s.deletedAt })),
  ];

  const summary: ImportSummary = { added: 0, updated: 0, deactivated: 0, skipped };
  // Parents first: cities, then zones, clusters, settlements.
  for (const level of ["city", "zone", "cluster", "settlement"] as const) {
    const existing = await prisma.uoPlace.findMany({ where: { legacyId: { not: null } }, select: { id: true, level: true, legacyId: true, name: true, parentId: true, lat: true, lng: true, active: true } });
    const byLegacy = new Map(existing.map((p) => [`${p.level}:${p.legacyId}`, p]));
    const rows = src.filter((r) => r.level === level);

    const toCreate: { level: string; legacyId: string; name: string; parentId: string | null; lat: number | null; lng: number | null; active: boolean }[] = [];
    for (const r of rows) {
      const parentId = r.parentLegacy ? byLegacy.get(`${r.parentLegacy.level}:${r.parentLegacy.id}`)?.id ?? null : null;
      if (r.parentLegacy && !parentId) { if (!r.deleted) skipped.push(`${level} "${r.name}": its ${r.parentLegacy.level} is missing`); continue; }
      const cur = byLegacy.get(`${level}:${r.legacyId}`);
      const next = { name: r.name.trim(), parentId, lat: r.lat ?? null, lng: r.lng ?? null, active: !r.deleted };
      if (!cur) {
        if (r.deleted) continue; // never import something already deleted
        toCreate.push({ level, legacyId: r.legacyId, ...next });
      } else if (cur.name !== next.name || cur.parentId !== next.parentId || cur.lat !== next.lat || cur.lng !== next.lng || cur.active !== next.active) {
        await prisma.uoPlace.update({ where: { id: cur.id }, data: next });
        if (cur.active && !next.active) summary.deactivated++; else summary.updated++;
      }
    }
    if (toCreate.length) {
      await prisma.uoPlace.createMany({ data: toCreate, skipDuplicates: true });
      summary.added += toCreate.length;
    }
  }

  await logEvent(prisma, { actorId, entity: "place", entityId: "import", action: "imported", after: { ...summary, skipped: skipped.length } });
  return summary;
}

export async function importPartners(actorId: string): Promise<{ added: number; updated: number }> {
  const orgs = await prisma.org.findMany({ where: { kind: "partner" }, select: { id: true, name: true, archivedAt: true } });
  const existing = await prisma.uoPartner.findMany({ select: { id: true, name: true, legacyOrgId: true, active: true } });
  const byLegacy = new Map(existing.filter((p) => p.legacyOrgId).map((p) => [p.legacyOrgId!, p]));
  const names = new Set(existing.map((p) => p.name.toLowerCase()));
  let added = 0, updated = 0;
  for (const o of orgs) {
    const cur = byLegacy.get(o.id);
    const active = !o.archivedAt;
    if (!cur) {
      if (!active || names.has(o.name.trim().toLowerCase())) continue;
      await prisma.uoPartner.create({ data: { name: o.name.trim(), legacyOrgId: o.id } });
      names.add(o.name.trim().toLowerCase());
      added++;
    } else if (cur.name !== o.name.trim() || cur.active !== active) {
      await prisma.uoPartner.update({ where: { id: cur.id }, data: { name: o.name.trim(), active } });
      updated++;
    }
  }
  await logEvent(prisma, { actorId, entity: "partner", entityId: "import", action: "imported", after: { added, updated } });
  return { added, updated };
}

/** "Ambedkar Nagar · KR Puram · East · Bengaluru" — a place and its ancestors, nearest first. */
export async function placePaths(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw<{ id: string; path: string }[]>`
    WITH RECURSIVE up AS (
      SELECT p.id AS start, p.id, p."parentId", p.name, 0 AS depth FROM "uo_place" p WHERE p.id = ANY(${ids})
      UNION ALL
      SELECT up.start, q.id, q."parentId", q.name, up.depth + 1 FROM "uo_place" q JOIN up ON q.id = up."parentId"
    )
    SELECT start AS id, string_agg(name, ' · ' ORDER BY depth) AS path FROM up GROUP BY start`;
  return new Map(rows.map((r) => [r.id, r.path]));
}
