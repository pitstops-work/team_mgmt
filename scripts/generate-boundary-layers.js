/**
 * Generates clusters.geojson and zones.geojson from the settlement polygon layers.
 * Run with: node scripts/generate-boundary-layers.js
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../public/data");

const POLYGON_FILES = [
  "sangama", "cfar", "actionaid", "sama", "gubbachi",
  "sieds", "janasha", "maarga", "thamate",
];

const ZONE_COLORS = {
  North:   "#6366f1",
  South:   "#10b981",
  Central: "#f59e0b",
  West:    "#ef4444",
};

const CLUSTER_COLORS = [
  "#e11d48","#db2777","#9333ea","#7c3aed","#4f46e5",
  "#0284c7","#0891b2","#059669","#16a34a","#65a30d",
  "#ca8a04","#d97706","#ea580c","#dc2626","#be185d",
  "#7e22ce","#1d4ed8","#0e7490","#047857","#4d7c0f",
];

// ── Convex hull (Andrew's monotone chain) ────────────────────────────────────
function cross(O, A, B) {
  return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
}

function convexHull(points) {
  // Deduplicate
  const seen = new Set();
  const pts = points.filter(([x, y]) => {
    const k = `${x.toFixed(7)},${y.toFixed(7)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (pts.length < 3) return pts.length ? [...pts, pts[0]] : [];

  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  hull.push(hull[0]); // close ring
  return hull;
}

// ── Collect all coords from a GeoJSON geometry ───────────────────────────────
function extractCoords(geometry) {
  const coords = [];
  function walk(c) {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") { coords.push([c[0], c[1]]); return; }
    c.forEach(walk);
  }
  walk(geometry.coordinates);
  return coords;
}

// ── Load all settlement features ─────────────────────────────────────────────
const allFeatures = [];
for (const name of POLYGON_FILES) {
  const raw = fs.readFileSync(path.join(DATA_DIR, `${name}.geojson`), "utf8");
  const fc = JSON.parse(raw);
  for (const f of fc.features) {
    if (f.geometry) allFeatures.push(f);
  }
}

console.log(`Loaded ${allFeatures.length} settlement features`);

// ── Group by cluster and zone ─────────────────────────────────────────────────
const byCluster = {};
const byZone = {};

for (const f of allFeatures) {
  const cluster = f.properties.cluster || "";
  const zone    = f.properties.zone    || "";
  const coords  = extractCoords(f.geometry);

  if (cluster) {
    if (!byCluster[cluster]) byCluster[cluster] = { zone, coords: [] };
    byCluster[cluster].coords.push(...coords);
  }
  if (zone) {
    if (!byZone[zone]) byZone[zone] = [];
    byZone[zone].push(...coords);
  }
}

// ── Build clusters GeoJSON ────────────────────────────────────────────────────
const clusterKeys = Object.keys(byCluster).sort();
const clusterFeatures = [];

clusterKeys.forEach((cluster, i) => {
  const { zone, coords } = byCluster[cluster];
  const hull = convexHull(coords);
  if (hull.length < 4) return; // need at least a triangle + closing point

  const label = cluster.replace(/_/g, " ");
  clusterFeatures.push({
    type: "Feature",
    properties: {
      cluster,
      label,
      zone,
      color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
    },
    geometry: {
      type: "Polygon",
      coordinates: [hull],
    },
  });
  console.log(`  Cluster: ${label} (${zone}) — ${coords.length} pts → hull ${hull.length - 1} pts`);
});

fs.writeFileSync(
  path.join(DATA_DIR, "clusters.geojson"),
  JSON.stringify({ type: "FeatureCollection", features: clusterFeatures }, null, 2)
);
console.log(`\nWrote clusters.geojson (${clusterFeatures.length} clusters)`);

// ── Build zones GeoJSON ───────────────────────────────────────────────────────
const zoneFeatures = [];

for (const [zone, coords] of Object.entries(byZone)) {
  const hull = convexHull(coords);
  if (hull.length < 4) continue;

  zoneFeatures.push({
    type: "Feature",
    properties: {
      zone,
      color: ZONE_COLORS[zone] || "#64748b",
    },
    geometry: {
      type: "Polygon",
      coordinates: [hull],
    },
  });
  console.log(`  Zone: ${zone} — ${coords.length} pts → hull ${hull.length - 1} pts`);
}

fs.writeFileSync(
  path.join(DATA_DIR, "zones.geojson"),
  JSON.stringify({ type: "FeatureCollection", features: zoneFeatures }, null, 2)
);
console.log(`\nWrote zones.geojson (${zoneFeatures.length} zones)`);
