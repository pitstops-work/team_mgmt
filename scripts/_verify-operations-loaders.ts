import prisma from "../lib/prisma";
import { loadOperationsHome } from "../lib/operations/home";
import { loadCentresForTheme } from "../lib/operations/centres";
import { loadThemeCatalog, indexThemes } from "../lib/operations/themes";

async function main() {
  // Pick the user who owns the most active goals with a needsDomain — most
  // likely a real RP running centres.
  const top = await prisma.goal.groupBy({
    by: ["ownerId"],
    where: { deletedAt: null, status: { not: "Complete" }, needsDomain: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { ownerId: "desc" } },
    take: 5,
  });
  console.log("Top goal owners (by domain-goal count):");
  for (const t of top) console.log(`  ${t.ownerId}  ${t._count._all} goals`);
  if (top.length === 0) { console.log("No domain goals found."); return; }

  const userId = top[0].ownerId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  console.log(`\n=== Operations home for: ${user?.name ?? userId} ===`);
  const tiles = await loadOperationsHome([userId]);
  for (const t of tiles) {
    console.log(`  [${t.theme.label}]  settingUp=${t.settingUp} live=${t.live} done=${t.done} total=${t.total}  facility=${t.theme.isFacility}`);
  }

  if (tiles.length === 0) { console.log("(no themes)"); return; }

  const catalog = await loadThemeCatalog();
  const theme = indexThemes(catalog).get(tiles[0].theme.key)!;
  console.log(`\n=== Centres for theme: ${theme.label} ===`);
  const centres = await loadCentresForTheme([userId], theme);
  for (const c of centres.slice(0, 25)) {
    const ph = c.phase;
    const status =
      ph.lifecycle === "setting_up"
        ? `SETTING UP · ${ph.currentPhaseLabel} · ${ph.currentStep}/${ph.totalSteps}`
        : ph.lifecycle === "live"
        ? `LIVE · ${c.month.done}/${c.month.total} this month`
        : `DONE`;
    console.log(`  ${c.name.padEnd(38)} ${(c.cluster?.name ?? "—").padEnd(18)} ${status}`);
  }
  console.log(`\n(${centres.length} centres total)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
