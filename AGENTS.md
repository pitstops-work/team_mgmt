<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Public pages (no sign-in)

Static public pages live in `public/` and are served without auth via the
`PUBLIC_PREFIXES` list in `middleware.ts` (`/training/`, `/workshop/`, the
root-level `*.html` hubs). To add a public page, drop the HTML under
`public/training/` (already whitelisted) and link it from the hub,
`public/pitstops-training.html`.

## Bengaluru Settlement Needs Map — `/training/settlement-needs-map.html`

The all-zone needs assessment + GBA proposal, superimposed on the programme's
settlement mapping the way the in-app Programme Map (`/map`) shows it: a
MapLibre GL map (cdnjs, pinned 4.7.1) with OSM streets / Esri satellite
basemaps, 298 partner-coloured settlement footprints as GeoJSON fill layers,
and the assessment marks (sites, schools, animal premises, resource centres,
cluster labels) as DOM markers reusing the page's own CSS. Public; linked
from the training hub's "Start here" section.

- EXTERNAL AUDIENCE: the page copy must never name Pitstops or link into the
  app — it says "the programme's settlement mapping". Keep it that way when
  editing.
- Self-contained data: it embeds a snapshot of the settlement layers from
  `public/data/all.geojson` (dated 28 October 2026) as a `PITSTOPS` JS
  constant (GeoJSON geometries, 5-dp coords), plus a `CLMAP` alias table
  mapping assessment cluster spellings to mapping cluster spellings
  (e.g. Nagarabhavi → Nagarbhavi). DB-drawn polygon edits after that date are
  NOT in it.
- To refresh after the mapping changes: regenerate `PITSTOPS` from the current
  `all.geojson` (same shape: `partners`, `settlements` with `geom`, `rcs`,
  `stats`), recompute the spatial matching (assessed-site counts per footprint
  are point-in-polygon against the sites in the page's `DATA` constant), and
  update the snapshot date in the footprints note. Everything needed is inside
  the page itself; there is no separate build script in the repo.
