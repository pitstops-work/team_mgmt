/**
 * Batch-draw polygons for 32 orphaned Bangalore settlements.
 * Geocodes each via Nominatim, creates a ~150m rectangular polygon,
 * and injects it into the appropriate static GeoJSON file.
 *
 * Usage: npx tsx scripts/batch-draw-orphan-polygons.ts [--dry-run]
 *
 * --dry-run: prints what would be added, does not write files
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../public/data');
const DRY_RUN = process.argv.includes('--dry-run');

// Nominatim viewbox: Bangalore bounding box [min_lon, min_lat, max_lon, max_lat]
const BLORE_BBOX = '77.3,12.7,77.9,13.2';

// Half-width of the injected polygon in degrees (~150m each way)
const D_LAT = 0.00135;  // ~150m at lat 13°
const D_LNG = 0.00140;

// cluster → best GeoJSON file (derived from cluster-to-file-map.ts analysis)
const CLUSTER_FILE: Record<string, string> = {
  'Rayapuram':    'thamate',
  'Nagarbhavi':   'cfar',
  'Koramangala':  'maarga',
  'Kengeri':      'cfar',
  'Anekal':       'sieds',
  'Jayanagar':    'maarga',
  'KR Market':    'actionaid',
  'Peenya - West':'cfar',
  'Yeshwantpur':  'cfar',
  'Hebbal':       'sangama',  // no file for Hebbal — sangama is nearest geographically
  'Bellandur':    'gubbachi',
  'JJR Nagar':    'actionaid',
};

// cluster → zone (for GeoJSON properties)
const CLUSTER_ZONE: Record<string, string> = {
  'Rayapuram':    'Central',
  'Nagarbhavi':   'Central',
  'Koramangala':  'South',
  'Kengeri':      'West',
  'Anekal':       'South',
  'Jayanagar':    'South',
  'KR Market':    'Central',
  'Peenya - West':'West',
  'Yeshwantpur':  'West',
  'Hebbal':       'North',
  'Bellandur':    'South',
  'JJR Nagar':    'Central',
};

interface Orphan {
  name: string;
  cluster: string;
  // Optional override: search query instead of name
  searchQuery?: string;
}

// The 32 orphaned settlements (from check-orphan-partners.ts output)
const ORPHANS: Orphan[] = [
  { name: '8th and 9th Main Road',          cluster: 'Rayapuram',    searchQuery: '8th Main Road, Rayapuram, Bangalore' },
  { name: 'Ahammed Nagar (CRC proposed)',    cluster: 'Nagarbhavi',   searchQuery: 'Ahmed Nagar, Nagarbhavi, Bangalore' },
  { name: 'Ambedkar nagar I',               cluster: 'Koramangala',  searchQuery: 'Ambedkar Nagar, Koramangala, Bangalore' },
  { name: 'Ambedkar nagar II',              cluster: 'Koramangala',  searchQuery: 'Ambedkar Nagar, Koramangala, Bangalore' },
  { name: 'Ambedkar nagar III',             cluster: 'Koramangala',  searchQuery: 'Ambedkar Nagar, Koramangala, Bangalore' },
  { name: 'Bheemana kuppe',                 cluster: 'Kengeri',      searchQuery: 'Bheemana Kuppe, Kengeri, Bangalore' },
  { name: 'Bilwaradahalli',                 cluster: 'Anekal',       searchQuery: 'Bilwaradahalli, Anekal, Bangalore' },
  { name: 'Corporation Colony',             cluster: 'Nagarbhavi',   searchQuery: 'Corporation Colony, Nagarbhavi, Bangalore' },
  { name: 'Corporation Colony',             cluster: 'Jayanagar',    searchQuery: 'Corporation Colony, Jayanagar, Bangalore' },
  { name: 'Doraiswamy Nagar',              cluster: 'KR Market',    searchQuery: 'Doraiswamy Nagar, Bangalore' },
  { name: 'Flower Garden',                  cluster: 'KR Market',    searchQuery: 'Flower Garden, KR Market, Bangalore' },
  { name: 'Goutham Nagar',                  cluster: 'Peenya - West',searchQuery: 'Goutham Nagar, Peenya, Bangalore' },
  { name: 'Gowripura',                      cluster: 'Kengeri',      searchQuery: 'Gowripura, Kengeri, Bangalore' },
  { name: 'Gundappa Colony',               cluster: 'Jayanagar',    searchQuery: 'Gundappa Colony, Jayanagar, Bangalore' },
  { name: 'Hospalya',                       cluster: 'Kengeri',      searchQuery: 'Hospalya, Kengeri, Bangalore' },
  { name: 'Jaibheemnagar',                  cluster: 'Yeshwantpur',  searchQuery: 'Jaibhim Nagar, Yeshwantpur, Bangalore' },
  { name: 'Jaibhuvaneshwari Nagar',         cluster: 'Peenya - West',searchQuery: 'Bhuvaneshwari Nagar, Nagarbhavi, Bangalore' },
  { name: 'Kabbalamma palya',               cluster: 'Kengeri',      searchQuery: 'Kabbalamma palya, Kengeri, Bangalore' },
  { name: 'Kanminke',                       cluster: 'Kengeri',      searchQuery: 'Kanminike, Kengeri, Bangalore' },
  { name: 'Kempapura',                      cluster: 'Hebbal',       searchQuery: 'Kempapura, Hebbal, Bangalore' },
  { name: 'Khalikatta',                     cluster: 'Bellandur',    searchQuery: 'Khalikatta, Bellandur, Bangalore' },
  { name: 'MCT Colony',                     cluster: 'JJR Nagar',    searchQuery: 'MCT Colony, Bangalore' },
  { name: 'Pillaganahalli',                 cluster: 'Anekal',       searchQuery: 'Pillaganahalli, Anekal, Bangalore' },
  { name: 'Rajendra Nagar II',              cluster: 'Koramangala',  searchQuery: 'Rajendra Nagar, Koramangala, Bangalore' },
  { name: 'Rajendra Nagar III',             cluster: 'Koramangala',  searchQuery: 'Rajendra Nagar, Koramangala, Bangalore' },
  { name: 'Seepkere',                       cluster: 'Anekal',       searchQuery: 'Seepkere, Anekal, Bangalore' },
  { name: 'Shastri Nagar (Koramangala)',    cluster: 'Koramangala',  searchQuery: 'Shastri Nagar, Koramangala, Bangalore' },
  { name: 'Shilidradoddi',                  cluster: 'Anekal',       searchQuery: 'Shilidradoddi, Anekal, Bangalore' },
  { name: 'Subbarayanapalya',               cluster: 'Kengeri',      searchQuery: 'Subbarayanapalya, Kengeri, Bangalore' },
  { name: 'Sunnadgudu',                     cluster: 'Yeshwantpur',  searchQuery: 'Sunnadagudu, Yeshwantpur, Bangalore' },
  { name: 'Thigalara Beedi',               cluster: 'Anekal',       searchQuery: 'Thigalara Beedi, Anekal, Bangalore' },
  { name: 'Vinayaka and Karimandi',         cluster: 'Yeshwantpur',  searchQuery: 'Vinayaka Nagar, Yeshwantpur, Bangalore' },
];

// Centroid fallbacks for each cluster (approximate center of the cluster area)
// Used when Nominatim returns nothing within Bangalore bounds
const CLUSTER_CENTROID: Record<string, [number, number]> = {
  'Rayapuram':     [77.5756, 12.9635],
  'Nagarbhavi':    [77.5026, 12.9500],
  'Koramangala':   [77.6245, 12.9352],
  'Kengeri':       [77.4815, 12.9173],
  'Anekal':        [77.6950, 12.7100],
  'Jayanagar':     [77.5939, 12.9250],
  'KR Market':     [77.5789, 12.9640],
  'Peenya - West': [77.5095, 13.0300],
  'Yeshwantpur':   [77.5508, 13.0200],
  'Hebbal':        [77.5950, 13.0435],
  'Bellandur':     [77.6741, 12.9259],
  'JJR Nagar':     [77.5500, 12.9400],
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function geocode(query: string): Promise<[number, number] | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('viewbox', BLORE_BBOX);
  url.searchParams.set('bounded', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'pitstops-internal-script/1.0' },
  });
  if (!res.ok) return null;
  const data = await res.json() as Array<{ lat: string; lon: string }>;
  if (!data.length) return null;
  return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
}

function makeRectPolygon(lng: number, lat: number, dLng = D_LNG, dLat = D_LAT) {
  return {
    type: 'Polygon',
    coordinates: [[
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
      [lng - dLng, lat - dLat],
    ]],
  };
}

interface GeoJSONFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

function loadGeoJSON(file: string): { type: string; features: GeoJSONFeature[] } {
  const fp = path.join(DATA_DIR, `${file}.geojson`);
  return JSON.parse(fs.readFileSync(fp, 'utf-8'));
}

function saveGeoJSON(file: string, gj: { type: string; features: GeoJSONFeature[] }) {
  const fp = path.join(DATA_DIR, `${file}.geojson`);
  fs.writeFileSync(fp, JSON.stringify(gj, null, 2));
}

function featureExists(gj: { features: GeoJSONFeature[] }, name: string): boolean {
  const norm = name.trim().toLowerCase();
  return gj.features.some(f => {
    const n = String(f.properties?.name ?? '').trim().toLowerCase();
    return n === norm;
  });
}

async function main() {
  console.log(`Batch drawing ${ORPHANS.length} orphaned settlements${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

  // Load all target GeoJSON files once
  const geoFiles: Record<string, { type: string; features: GeoJSONFeature[] }> = {};
  const targetFiles = [...new Set(ORPHANS.map(o => CLUSTER_FILE[o.cluster]).filter(Boolean))];
  for (const f of targetFiles) {
    geoFiles[f] = loadGeoJSON(f);
    console.log(`Loaded ${f}.geojson (${geoFiles[f].features.length} features)`);
  }
  console.log('');

  const results: Array<{ name: string; cluster: string; file: string; source: string; lat: number; lng: number }> = [];
  const failed: string[] = [];

  for (let i = 0; i < ORPHANS.length; i++) {
    const orphan = ORPHANS[i];
    const file = CLUSTER_FILE[orphan.cluster];
    const zone = CLUSTER_ZONE[orphan.cluster] ?? '';

    if (!file) {
      console.log(`  SKIP  ${orphan.name} — no file mapped for cluster "${orphan.cluster}"`);
      failed.push(orphan.name);
      continue;
    }

    const gj = geoFiles[file];
    if (featureExists(gj, orphan.name)) {
      console.log(`  SKIP  ${orphan.name} — already in ${file}.geojson`);
      continue;
    }

    // Nominatim geocode
    const query = orphan.searchQuery ?? `${orphan.name}, Bangalore`;
    process.stdout.write(`  [${i + 1}/${ORPHANS.length}] Geocoding "${query}"... `);
    let coords = await geocode(query);
    let source = 'nominatim';
    await sleep(1100); // respect 1 req/sec

    if (!coords) {
      // Fallback: cluster centroid
      const fallback = CLUSTER_CENTROID[orphan.cluster];
      if (fallback) {
        coords = fallback;
        source = 'cluster-centroid';
      } else {
        console.log('FAILED (no geocode, no fallback)');
        failed.push(orphan.name);
        continue;
      }
    }

    const [lng, lat] = coords;
    console.log(`${source} → [${lat.toFixed(5)}, ${lng.toFixed(5)}]`);

    results.push({ name: orphan.name, cluster: orphan.cluster, file, source, lat, lng });

    if (!DRY_RUN) {
      const feature: GeoJSONFeature = {
        type: 'Feature',
        geometry: makeRectPolygon(lng, lat),
        properties: {
          name: orphan.name,
          description: '',
          layer: file,
          zone,
          cluster: orphan.cluster,
        },
      };
      gj.features.push(feature);
    }
  }

  // Write updated files
  if (!DRY_RUN) {
    for (const f of targetFiles) {
      if (geoFiles[f]) {
        saveGeoJSON(f, geoFiles[f]);
        console.log(`\nSaved ${f}.geojson`);
      }
    }
  }

  console.log('\n── Summary ──');
  console.log(`  Added:  ${results.length}`);
  console.log(`  Failed: ${failed.length}${failed.length ? ' — ' + failed.join(', ') : ''}`);

  if (results.length > 0) {
    console.log('\n── Added settlements ──');
    for (const r of results) {
      console.log(`  [${r.file}] "${r.name}" (${r.cluster}) via ${r.source} @ [${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}]`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
