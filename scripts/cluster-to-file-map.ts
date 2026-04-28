/**
 * For each static GeoJSON file, counts how many features mention each cluster.
 * Determines which file best represents each cluster.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES = [
  'actionaid','cfar','gubbachi','janasha','maarga','sieds',
  'sama','sangama','thamate',
];

const TARGET_CLUSTERS = [
  'Rayapuram', 'Nagarbhavi', 'Koramangala', 'Kengeri', 'Anekal',
  'Jayanagar', 'KR Market', 'Peenya - West', 'Yeshwantpur',
  'Hebbal', 'Bellandur', 'JJR Nagar'
];

async function main() {
  // cluster → { file: count }
  const clusterMap: Record<string, Record<string, number>> = {};

  for (const file of FILES) {
    const fp = path.join(__dirname, '../public/data', `${file}.geojson`);
    if (!fs.existsSync(fp)) continue;
    const gj = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    for (const feat of gj.features ?? []) {
      const p = feat.properties ?? {};
      const cluster = String(p.cluster ?? p.cluster_name ?? p.Cluster ?? '').trim().replace(/_/g, ' ');
      if (!cluster) continue;
      if (!clusterMap[cluster]) clusterMap[cluster] = {};
      clusterMap[cluster][file] = (clusterMap[cluster][file] ?? 0) + 1;
    }
  }

  console.log('\nCluster → best file (all files with settlements):');
  for (const cluster of TARGET_CLUSTERS) {
    const counts = clusterMap[cluster] ?? {};
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
      console.log(`  ${cluster}: NO FILE FOUND`);
    } else {
      console.log(`  ${cluster}: ${sorted.map(([f, n]) => `${f}(${n})`).join(', ')}`);
    }
  }

  // Also show all cluster → file data for reference
  console.log('\nAll cluster → file mappings from GeoJSON files:');
  for (const [cluster, counts] of Object.entries(clusterMap).sort()) {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    console.log(`  ${cluster}: ${sorted.map(([f, n]) => `${f}(${n})`).join(', ')}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
