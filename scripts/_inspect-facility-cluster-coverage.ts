import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { default: p } = await import("../lib/prisma");
  const totalCreches = await p.layerFeature.count({ where: { layerKey: "creches" } });
  const crechesWithCluster = await p.layerFeature.count({ where: { layerKey: "creches", clusterId: { not: null } } });
  const totalFeatures = await p.layerFeature.count();
  const featuresWithCluster = await p.layerFeature.count({ where: { clusterId: { not: null } } });
  console.log(`creches total: ${totalCreches}, with cluster: ${crechesWithCluster}`);
  console.log(`all features total: ${totalFeatures}, with cluster: ${featuresWithCluster}`);
  const sample = await p.layerFeature.findMany({
    where: { layerKey: "creches" },
    select: { name: true, cluster: { select: { name: true } }, settlement: { select: { name: true } } },
    take: 12,
  });
  console.log("\nFirst 12 creches:");
  for (const s of sample) console.log(JSON.stringify(s));

  // Also: per-layerKey coverage
  const layerKeys = await p.layerFeature.groupBy({
    by: ["layerKey"],
    _count: { _all: true },
  });
  console.log("\nPer-layerKey coverage:");
  for (const lk of layerKeys) {
    const withCluster = await p.layerFeature.count({ where: { layerKey: lk.layerKey, clusterId: { not: null } } });
    console.log(`  ${lk.layerKey}: ${withCluster}/${lk._count._all} have cluster`);
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
