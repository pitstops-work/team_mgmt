import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_URL = "postgresql://neondb_owner:npg_YUQet8y5GWov@ep-lingering-waterfall-a1xc3pu6.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const PARTNERS = [
  'actionaid','arunodhaya','cfar','dbai','dbsss',
  'gubbachi','janasha','maarga','sieds','sangama',
  'tndwwt','thamate','thozhamai',
];

// Manual overrides: settlement id → partner key
// Applied after auto-matching to resolve conflicts and hard name mismatches.
const MANUAL_OVERRIDES = {
  'cmnsycs19000ziyvcwtzd5vxk': 'arunodhaya', // R.R. Nagar (Royapuram–Harbour)
  'cmnsyd2ea004eiyvcdi3lz6ro': 'actionaid',  // AK Badavane (JJR Nagar)
  'cmnsycu69001niyvcvia6wz7r': 'sieds',      // AK Colony (Anekal)
  'cmnsyd2it004fiyvc720mbmlw': 'actionaid',  // AK Colony (JJR Nagar)
  'cmnsycqpd000jiyvcnf0atjzd': 'dbsss',     // K.M. Garden (Pulianthope)
  'cmnsydbyo007oiyvc0v0z414k': 'cfar',       // Vinayaka Slum (Nagarbhavi)
  'cmnsyd452004ziyvcg8mo87vh': 'cfar',       // Doddbele colony (Kengeri)
  'cmnsyd5tw005kiyvcikxu46di': 'maarga',     // Shastri Nagar (Koramangala)
  'cmnsyd94s006piyvcq9qtizw9': 'cfar',       // Shastri Nagar (Majestic)
  'cmnsydcg0007uiyvc7lh2dc90': 'cfar',       // Gulbarga Slum (Peenya - West)
  'cmnsyddip0087iyvc9m3f34zs': 'sangama',    // Gulbarga Slum (Peenya North)
  'cmnsydaa40073iyvcu2fnqa12': 'cfar',       // Chamundi Slum (Nagarbhavi) ← Chamundeshwari slum
  'cmnsycrd8000riyvcjtot2tyo': 'dbsss',     // V.O.C. Nagar (Pulianthope)
  'cmnsycs3o0010iyvcf4wb5fvu': 'arunodhaya', // Railway Colony (Royapuram–Harbour)
};

// ── Matching helpers ───────────────────────────────────────────────────────────
const normalise = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function wordOverlap(a, b) {
  const wa = new Set(normalise(a).split(' ').filter(w => w.length > 2));
  const wb = new Set(normalise(b).split(' ').filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  wa.forEach(w => { if (wb.has(w)) common++; });
  return common / Math.min(wa.size, wb.size);
}

// Fix 1: handle em-dash, ampersand, and underscore in cluster names
const normaliseCluster = s => s
  .replace(/–/g, ' ')
  .replace(/&/g, 'and')
  .replace(/_/g, ' ')
  .replace(/\s+area$/i, '')
  .replace(/\s+/g, ' ')
  .toLowerCase().trim();

// Fix 2: strip area/cluster suffixes embedded in GeoJSON settlement names
const AREA_SUFFIX_RE = /(?:,)?\s+(?:majestic|majectic|peenya|nagarbhavi|kengeri|yeshwantpur|koramangala|jayanagar|kurubarahalli|utterahalli|hoshalli|crc)\s*(?:area)?$/i;
const stripSuffix = name => name.replace(AREA_SUFFIX_RE, '').trim();

// Fix 3: space-collapsed edit distance for compound-word mismatches
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function collapseMatch(a, b) {
  const ca = normalise(a).replace(/\s+/g, '');
  const cb = normalise(b).replace(/\s+/g, '');
  if (ca === cb) return true;
  const maxLen = Math.max(ca.length, cb.length);
  if (maxLen < 5) return false;
  return levenshtein(ca, cb) <= Math.max(3, Math.floor(maxLen * 0.13));
}

function findMatch(geoName, candidates) {
  const lower   = geoName.trim().toLowerCase();
  const normed  = normalise(geoName);

  // 1. Exact
  let m = candidates.find(s => s.name.trim().toLowerCase() === lower);
  if (m) return { settlement: m, method: 'exact' };

  // 2. Normalised (strips punctuation / extra spaces)
  m = candidates.find(s => normalise(s.name) === normed);
  if (m) return { settlement: m, method: 'normalised' };

  // 2.5. Retry after stripping area suffix from GeoJSON name
  const stripped = stripSuffix(geoName);
  if (stripped !== geoName) {
    const r = findMatch(stripped, candidates);
    if (r) return { ...r, method: 'suffix-stripped+' + r.method };
  }

  // 3. Substring containment (min 6 chars)
  if (geoName.length >= 6) {
    m = candidates.find(s => {
      const dn = s.name.trim().toLowerCase();
      return (dn.includes(lower) || lower.includes(dn)) && Math.min(dn.length, lower.length) >= 6;
    });
    if (m) return { settlement: m, method: 'substring' };
  }

  // 4. Word overlap ≥ 65%
  let best = null, bestScore = 0;
  for (const s of candidates) {
    const score = wordOverlap(geoName, s.name);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (best && bestScore >= 0.65) return { settlement: best, method: `word-overlap(${bestScore.toFixed(2)})` };

  // 4.5. Space-collapsed edit distance (handles compound words)
  for (const s of candidates) {
    if (collapseMatch(geoName, s.name))
      return { settlement: s, method: 'collapse-edit' };
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const client = new Client({ connectionString: DB_URL });
await client.connect();

// Load all settlements with cluster name
const { rows: settlements } = await client.query(`
  SELECT s.id, s.name, s."partnerId", cl.name AS cluster_name
  FROM "Settlement" s
  JOIN "Cluster" cl ON cl.id = s."clusterId"
  WHERE s."deletedAt" IS NULL
`);

// Index by normalised cluster name → settlement[]
const byCluster = new Map();
for (const s of settlements) {
  const key = normaliseCluster(s.cluster_name);
  if (!byCluster.has(key)) byCluster.set(key, []);
  byCluster.get(key).push(s);
}

// Load MapPartner id lookup
const { rows: partners } = await client.query(`SELECT id, key, label FROM "MapPartner"`);
const partnerByKey = new Map(partners.map(p => [p.key, p]));

const dataDir = path.join(__dirname, '..', 'public', 'data');

const updates    = [];
const unmatched  = [];
const conflicts  = [];
const methodCounts = {};

const assignedSettlements = new Map(); // settlementId → partnerKey

for (const key of PARTNERS) {
  const fp = path.join(dataDir, key + '.geojson');
  let features;
  try {
    features = JSON.parse(fs.readFileSync(fp, 'utf8')).features ?? [];
  } catch { console.warn(`No GeoJSON for ${key}`); continue; }

  const partner = partnerByKey.get(key);
  if (!partner) { console.warn(`No MapPartner row for key=${key}`); continue; }

  for (const f of features) {
    const geoName   = String(f.properties?.name ?? '').trim();
    const rawCluster = String(f.properties?.cluster ?? '').trim();
    const geoCluster = rawCluster && rawCluster.toLowerCase() !== '(none)'
      ? normaliseCluster(rawCluster)
      : null;

    // Build candidate set: same cluster if known, else all settlements
    const candidates = geoCluster
      ? (byCluster.get(geoCluster) ?? [])
      : settlements;

    const result = findMatch(geoName, candidates);

    if (!result) {
      // If cluster-scoped attempt failed, retry across all settlements
      if (geoCluster && candidates.length > 0) {
        const globalResult = findMatch(geoName, settlements);
        if (globalResult) {
          const row = globalResult.settlement;
          if (assignedSettlements.has(row.id) && assignedSettlements.get(row.id) !== key) {
            conflicts.push({ dbName: row.name, p1: assignedSettlements.get(row.id), p2: key });
            continue;
          }
          assignedSettlements.set(row.id, key);
          const method = 'global-' + globalResult.method;
          methodCounts[method] = (methodCounts[method] ?? 0) + 1;
          if (row.partnerId !== partner.id)
            updates.push({ settlementId: row.id, partnerId: partner.id, partnerKey: key, geoName, dbName: row.name, method });
          continue;
        }
      }
      unmatched.push({ partner: key, geoName, geoCluster: geoCluster ?? '(none)' });
      continue;
    }

    const row = result.settlement;
    if (assignedSettlements.has(row.id) && assignedSettlements.get(row.id) !== key) {
      conflicts.push({ dbName: row.name, p1: assignedSettlements.get(row.id), p2: key });
      continue;
    }
    assignedSettlements.set(row.id, key);
    methodCounts[result.method] = (methodCounts[result.method] ?? 0) + 1;
    if (row.partnerId !== partner.id)
      updates.push({ settlementId: row.id, partnerId: partner.id, partnerKey: key, geoName, dbName: row.name, method: result.method });
  }
}

console.log(`\nMatched: ${assignedSettlements.size} | Updates: ${updates.length} | Unmatched: ${unmatched.length} | Conflicts: ${conflicts.length}`);
console.log('Match methods:', methodCounts);

if (conflicts.length) {
  console.log('\nConflicts (skipped):');
  conflicts.forEach(c => console.log(`  "${c.dbName}": ${c.p1} vs ${c.p2}`));
}

// ── Apply manual overrides ─────────────────────────────────────────────────────
for (const [settlementId, partnerKey] of Object.entries(MANUAL_OVERRIDES)) {
  const partner = partnerByKey.get(partnerKey);
  if (!partner) { console.warn(`No MapPartner row for manual override key=${partnerKey}`); continue; }
  const existing = settlements.find(s => s.id === settlementId);
  const dbName = existing?.name ?? settlementId;
  updates.push({ settlementId, partnerId: partner.id, partnerKey, geoName: '[manual]', dbName, method: 'manual-override' });
  assignedSettlements.set(settlementId, partnerKey);
}

// ── Apply updates ──────────────────────────────────────────────────────────────
if (updates.length > 0) {
  console.log('\nApplying updates…');
  // First clear ALL partnerId so stale assignments are removed
  await client.query(`UPDATE "Settlement" SET "partnerId" = NULL WHERE "deletedAt" IS NULL`);
  for (const u of updates) {
    await client.query(
      `UPDATE "Settlement" SET "partnerId" = $1, "updatedAt" = NOW() WHERE id = $2`,
      [u.partnerId, u.settlementId]
    );
  }
  console.log(`Done. ${updates.length} rows tagged.`);
}

// ── Write unmatched CSV ────────────────────────────────────────────────────────
const csvPath = path.join(__dirname, '..', 'unmatched-partner-settlements.csv');
fs.writeFileSync(csvPath, ['partner,geojson_name,geojson_cluster',
  ...unmatched.map(u => `${u.partner},"${u.geoName.replace(/"/g,'""')}","${u.geoCluster}"`)
].join('\n'));
console.log(`Unmatched CSV: unmatched-partner-settlements.csv (${unmatched.length} rows)`);

// ── Per-partner summary ────────────────────────────────────────────────────────
const byPartner = {};
for (const u of updates) byPartner[u.partnerKey] = (byPartner[u.partnerKey] ?? 0) + 1;
console.log('\nTagged per partner:');
for (const [k, n] of Object.entries(byPartner).sort()) console.log(`  ${k}: ${n}`);

await client.end();
