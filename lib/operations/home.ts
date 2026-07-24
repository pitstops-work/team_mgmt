/**
 * Operations home loader — the theme tiles.
 *
 * Loads the person's owned goals once, groups them into themes, and derives a
 * lifecycle count per theme (setting-up / live / done) so the home can render
 * one tile per theme the person actually works in. Lightweight: no per-centre
 * event queries here (the portal does that when opened).
 */

import prisma from "@/lib/prisma";
import { goalOwnedByAnyOf } from "@/lib/ownership";
import { deriveCentrePhase, type PhasePitstop } from "./phase";
import { loadThemeCatalog, loadLayerToDomain, resolveGoalThemeKey, indexThemes, type ThemeDef } from "./themes";

export type ThemeTile = {
  theme: ThemeDef;
  settingUp: number;
  live: number;
  done: number;
  total: number;
};

export async function loadOperationsHome(userIds: string[]): Promise<ThemeTile[]> {
  const [catalog, layerToDomain, goals] = await Promise.all([
    loadThemeCatalog(),
    loadLayerToDomain(),
    prisma.goal.findMany({
      where: {
        AND: [goalOwnedByAnyOf(userIds), { deletedAt: null, status: { not: "Complete" } }],
      },
      select: {
        id: true,
        needsDomain: true,
        linkedFacility: { select: { layerKey: true } },
        pitstops: {
          where: { deletedAt: null },
          select: { status: true, recurrence: true, order: true, progressTag: true, title: true },
        },
      },
    }),
  ]);

  const themeIndex = indexThemes(catalog);
  const buckets = new Map<string, { settingUp: number; live: number; done: number; total: number }>();

  for (const g of goals) {
    const key = resolveGoalThemeKey(g, layerToDomain);
    if (!key) continue;
    const phase = deriveCentrePhase(g.pitstops as PhasePitstop[]);
    const b = buckets.get(key) ?? { settingUp: 0, live: 0, done: 0, total: 0 };
    b.total += 1;
    if (phase.lifecycle === "setting_up") b.settingUp += 1;
    else if (phase.lifecycle === "live") b.live += 1;
    else b.done += 1;
    buckets.set(key, b);
  }

  const tiles: ThemeTile[] = [];
  for (const [key, b] of buckets) {
    const theme: ThemeDef =
      themeIndex.get(key) ?? { key, label: key, color: "#6b7280", layerKey: null, isFacility: false, sortOrder: 999 };
    tiles.push({ theme, ...b });
  }

  tiles.sort((a, b) => a.theme.sortOrder - b.theme.sortOrder || a.theme.label.localeCompare(b.theme.label));
  return tiles;
}
