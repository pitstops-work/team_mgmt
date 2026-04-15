#!/usr/bin/env python3
"""
Generate cluster and zone boundary polygons for Chennai from settlement GeoJSON coords.
Adds features to public/data/clusters.geojson and public/data/zones.geojson.
"""
import json, math, os

DATA_DIR = os.path.join(os.path.dirname(__file__), "../public/data")

CHENNAI_LAYERS = ["arunodhaya", "tndwwt", "dbai", "dbsss", "thozhamai"]

# Convex hull (Graham scan) on a list of (x, y) points
def cross(O, A, B):
    return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])

def convex_hull(points):
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]

def extract_coords(geometry):
    """Flatten all coordinates from any geometry type."""
    coords = []
    gtype = geometry.get("type", "")
    if gtype == "Point":
        pt = geometry.get("coordinates", [])
        if len(pt) >= 2:
            coords.append(tuple(pt[:2]))
    elif gtype in ("LineString", "MultiPoint"):
        for pt in geometry.get("coordinates", []):
            coords.append(tuple(pt[:2]))
    elif gtype == "MultiLineString":
        for line in geometry.get("coordinates", []):
            coords.extend(tuple(pt[:2]) for pt in line)
    elif gtype == "Polygon":
        for ring in geometry.get("coordinates", []):
            coords.extend(tuple(pt[:2]) for pt in ring)
    elif gtype == "MultiPolygon":
        for poly in geometry.get("coordinates", []):
            for ring in poly:
                coords.extend(tuple(pt[:2]) for pt in ring)
    return coords

def buffer_hull(hull, delta=0.001):
    """Slightly expand hull by moving each point outward from centroid."""
    if not hull:
        return hull
    cx = sum(p[0] for p in hull) / len(hull)
    cy = sum(p[1] for p in hull) / len(hull)
    buffered = []
    for x, y in hull:
        dx, dy = x - cx, y - cy
        dist = math.sqrt(dx*dx + dy*dy) or 1e-9
        buffered.append((x + dx/dist*delta, y + dy/dist*delta))
    return buffered

# Cluster display names and zone assignments from zone_cluster_index
with open(os.path.join(DATA_DIR, "zone_cluster_index.json")) as f:
    index = json.load(f)
cluster_meta = index["clusters"]  # key -> {zone, display?, settlements}

# Collect all settlement polygons grouped by cluster
cluster_coords = {}  # cluster_key -> [(lng,lat), ...]
zone_coords    = {}  # zone_name  -> [(lng,lat), ...]

for layer in CHENNAI_LAYERS:
    fpath = os.path.join(DATA_DIR, f"{layer}.geojson")
    with open(fpath) as f:
        gj = json.load(f)
    for feature in gj["features"]:
        props = feature.get("properties", {})
        cluster_key = props.get("cluster", "")
        zone_name   = props.get("zone", "")
        geom        = feature.get("geometry", {})
        coords = extract_coords(geom)
        if not coords or not cluster_key:
            continue
        cluster_coords.setdefault(cluster_key, []).extend(coords)
        zone_coords.setdefault(zone_name, []).extend(coords)

# Zone color map
ZONE_COLORS = {
    "Chennai – Central":      "#f59e0b",
    "Chennai – North":        "#ef4444",
    "Chennai – Resettlement": "#8b5cf6",
}

# Cluster color map (rotate through a palette)
CLUSTER_COLORS = [
    "#0ea5e9", "#16a34a", "#b45309", "#7c3aed", "#be123c",
    "#f97316", "#0891b2", "#65a30d", "#dc2626", "#6366f1",
]

# ── Update clusters.geojson ───────────────────────────────────────────────────
clusters_path = os.path.join(DATA_DIR, "clusters.geojson")
with open(clusters_path) as f:
    clusters_gj = json.load(f)

# Remove any existing Chennai cluster features
existing_cluster_keys = {f["properties"]["cluster"] for f in clusters_gj["features"]}
chennai_cluster_keys  = set(cluster_coords.keys())

# Remove old Chennai entries
clusters_gj["features"] = [
    f for f in clusters_gj["features"]
    if f["properties"]["cluster"] not in chennai_cluster_keys
]

for i, (cluster_key, coords) in enumerate(sorted(cluster_coords.items())):
    hull = convex_hull(coords)
    if len(hull) < 3:
        print(f"  Skipping {cluster_key}: only {len(hull)} unique hull points")
        continue
    hull = buffer_hull(hull, delta=0.002)
    # Close ring
    ring = [list(p) for p in hull] + [list(hull[0])]
    meta = cluster_meta.get(cluster_key, {})
    display = meta.get("display", cluster_key.replace("_", " "))
    zone_name = meta.get("zone", "")
    color = CLUSTER_COLORS[i % len(CLUSTER_COLORS)]
    feature = {
        "type": "Feature",
        "properties": {
            "cluster": cluster_key,
            "label": display,
            "zone": zone_name,
            "color": color,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [ring],
        },
    }
    clusters_gj["features"].append(feature)
    print(f"  Cluster: {cluster_key} ({display}) — {len(hull)} hull pts")

with open(clusters_path, "w") as f:
    json.dump(clusters_gj, f, separators=(",", ":"))
print(f"clusters.geojson updated ({len(clusters_gj['features'])} features)")

# ── Update zones.geojson ──────────────────────────────────────────────────────
zones_path = os.path.join(DATA_DIR, "zones.geojson")
with open(zones_path) as f:
    zones_gj = json.load(f)

# Remove existing Chennai zone features
chennai_zones = set(zone_coords.keys())
zones_gj["features"] = [
    f for f in zones_gj["features"]
    if f["properties"]["zone"] not in chennai_zones
]

for zone_name, coords in sorted(zone_coords.items()):
    hull = convex_hull(coords)
    if len(hull) < 3:
        print(f"  Skipping zone {zone_name}: only {len(hull)} hull pts")
        continue
    hull = buffer_hull(hull, delta=0.004)
    ring = [list(p) for p in hull] + [list(hull[0])]
    color = ZONE_COLORS.get(zone_name, "#64748b")
    feature = {
        "type": "Feature",
        "properties": {
            "zone": zone_name,
            "color": color,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [ring],
        },
    }
    zones_gj["features"].append(feature)
    print(f"  Zone: {zone_name} — {len(hull)} hull pts")

with open(zones_path, "w") as f:
    json.dump(zones_gj, f, separators=(",", ":"))
print(f"zones.geojson updated ({len(zones_gj['features'])} features)")
