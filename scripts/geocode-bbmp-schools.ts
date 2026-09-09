/**
 * scripts/geocode-bbmp-schools.ts
 *
 * Fills in coordinates for BbmpSchool rows that the KGIS UDISE-code join could
 * not resolve (lat/lng NULL), using Google Places API (New) Text Search.
 *
 * Places is used rather than Geocoding because these are POI *names*
 * ("BBMP PU College Uttarahalli"), not postal addresses. Nominatim was tried and
 * rejected: it resolved only to ward centroids 1-2 km out, which would corrupt
 * the settlement-proximity distances this layer exists to measure.
 *
 * Every candidate is sanity-checked before it is offered:
 *   - inside the Bangalore bounding box
 *   - the returned place looks like a school/college (type or name)
 *   - AND it sits within LOCALITY_RADIUS_KM of the school's own locality, which
 *     is geocoded separately from the LGD ward or the locality in the school
 *     name. This last check is the important one: Places will confidently return
 *     a same-named BBMP college on the other side of the city (it put
 *     "PU COLLEGE THANISANDRA" on Magadi Road, 12 km out), and name/type/bbox
 *     checks all wave that through.
 * Anything failing a check is reported but never written.
 *
 * DRY RUN BY DEFAULT — prints what it would write. Pass --apply to persist,
 * which also stamps geocodeSource="google" so a later re-import will not
 * overwrite it with a KGIS null.
 *
 * Key: GOOGLE_PLACES_API_KEY, falling back to GOOGLE_TRANSLATE_API_KEY (the
 * same Google Cloud key, widened to allow Places API (New) + Geocoding).
 *
 * Usage:
 *   npx tsx scripts/geocode-bbmp-schools.ts                     # preview
 *   npx tsx scripts/geocode-bbmp-schools.ts --apply --strict    # write BBMP-named matches only
 *   npx tsx scripts/geocode-bbmp-schools.ts --apply             # write every passing match
 */

import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
// --strict: only accept a match whose own name says BBMP/Corporation. Without it,
// Places will hand back the neighbouring Government or private school — right
// area, wrong building, a few hundred metres out. That is enough to move a school
// between the 500m/1km bands the report is read in.
const STRICT = process.argv.includes("--strict");
const KEY = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_TRANSLATE_API_KEY ?? "";

// Bangalore Urban + Rural, generous margin
const BBOX = { minLat: 12.5, maxLat: 13.5, minLng: 77.2, maxLng: 78.1 };
const inBbox = (lat: number, lng: number) =>
  lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng;

const SCHOOLISH = /school|college|vidya|pu |p\.u|primary|secondary|education/i;
const LOCALITY_RADIUS_KM = 3;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Locality centroid via the Geocoding API — coarse on purpose; used only to reject far-away matches. */
async function geocodeLocality(name: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(name + ", Bengaluru, Karnataka, India")}&key=${KEY}`;
  const j = await (await fetch(url)).json();
  const loc = j?.results?.[0]?.geometry?.location;
  return loc ? { lat: loc.lat, lng: loc.lng } : null;
}

/**
 * Best-guess locality to anchor against. The UDISE address wins: the school NAME
 * can name a different place entirely — "GBA (BBMP) COMPOSITE PU COLLEGE
 * KATTIGENAHALLI" is actually addressed at Byatarayanapura, Yelahanka — and
 * anchoring on the name sends the check 20 km wrong.
 */
function localityOf(name: string, lgdWard: string | null, address: string | null, pincode: string | null): string {
  const addr = (address ?? "").trim();
  if (addr && addr.length > 6) return `${addr}${pincode && pincode !== "NA" ? " " + pincode : ""}`;
  if (lgdWard && lgdWard !== "NA") return lgdWard.replace(/Ward No\.\d+\s*/i, "").replace(/[()]/g, "").trim();
  return name
    .replace(/GREATER BANGALORE AUTHORITY|\(BBMP\)|B\s*B\s*M\s*P|BBMP/gi, " ")
    .replace(/COMPOSITE|PU COLLEGE|HIGH SCHOOL|HIGHER PRIMARY SCHOOL|HPS|HS|SCHOOL|COLLEGE/gi, " ")
    .replace(/\s+/g, " ").trim();
}

interface Candidate {
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
}

async function searchPlace(query: string): Promise<Candidate[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location,places.types",
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 3,
      // Bias, not restrict — a restrict would silently drop fringe schools.
      locationBias: { circle: { center: { latitude: 12.97, longitude: 77.59 }, radius: 40000 } },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${json.error.code}: ${json.error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json.places ?? []).map((p: any) => ({
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    types: p.types ?? [],
  }));
}

async function main() {
  if (!KEY) {
    console.error("No GOOGLE_PLACES_API_KEY / GOOGLE_TRANSLATE_API_KEY in .env.local");
    process.exit(1);
  }
  const { prisma } = await import("../lib/prisma");
  const pending = await prisma.bbmpSchool.findMany({
    where: { OR: [{ lat: null }, { lng: null }] },
    orderBy: { name: "asc" },
  });
  console.log(`${pending.length} BBMP schools awaiting coordinates${APPLY ? "" : "   (DRY RUN — nothing will be written)"}\n`);

  let ok = 0, rejected = 0, none = 0;
  for (const s of pending) {
    const ward = s.lgdWard && s.lgdWard !== "NA" ? s.lgdWard.replace(/Ward No\.\d+\s*/i, "").replace(/[()]/g, "") : "";
    const query = [s.name, s.address ?? "", ward, "Bengaluru, Karnataka", s.pincode && s.pincode !== "NA" ? s.pincode : ""]
      .filter(Boolean).join(", ");

    let cands: Candidate[] = [];
    try { cands = await searchPlace(query); }
    catch (e) { console.log(`  ERROR  ${s.name}\n         ${e instanceof Error ? e.message : e}`); continue; }

    if (!cands.length) { console.log(`  NONE   ${s.name}\n         query: ${query}`); none++; continue; }

    const locName = localityOf(s.name, s.lgdWard, s.address, s.pincode);
    const anchor = locName ? await geocodeLocality(locName) : null;

    // Keep every candidate that passes all checks, then prefer a BBMP-named one.
    // Places often ranks a neighbouring *Government* school above the BBMP one.
    const passing: Candidate[] = [];
    let why = "";
    for (const c of cands) {
      if (!inBbox(c.lat, c.lng)) { why ||= "outside the Bangalore bounding box"; continue; }
      if (!(SCHOOLISH.test(c.name) || c.types.some(t => /school|university|primary_school|secondary_school/.test(t)))) {
        why ||= "does not look like a school/college"; continue;
      }
      if (anchor) {
        const d = haversine(c.lat, c.lng, anchor.lat, anchor.lng);
        if (d > LOCALITY_RADIUS_KM) { why ||= `${d.toFixed(1)} km from ${locName} (limit ${LOCALITY_RADIUS_KM} km)`; continue; }
      }
      passing.push(c);
    }
    const isBbmpNamed = (c: Candidate) => /\bb\.?\s*b\.?\s*m\.?\s*p\b|corporation|mahanagar/i.test(c.name);
    const top: Candidate | undefined = passing.find(isBbmpNamed) ?? passing[0];
    const preferred = !!top && passing.length > 1 && isBbmpNamed(top) && top !== passing[0];

    const verdict = !!top && (!STRICT || isBbmpNamed(top));
    const shown = top ?? cands[0];
    console.log(`  ${verdict ? "OK    " : "REJECT"} ${s.name}  [${s.udiseCode}]`);
    console.log(`         -> ${shown.name}`);
    console.log(`            ${shown.address.slice(0, 78)}`);
    console.log(`            ${shown.lat?.toFixed(5)},${shown.lng?.toFixed(5)}  types=${shown.types.slice(0,3).join("/")}`);
    console.log(`            locality="${locName}"${anchor ? ` @ ${anchor.lat.toFixed(4)},${anchor.lng.toFixed(4)}` : " (not geocodable)"}`);
    if (verdict && anchor) console.log(`            ${haversine(shown.lat, shown.lng, anchor.lat, anchor.lng).toFixed(2)} km from locality ✓`);
    if (preferred) console.log(`            (preferred over "${passing[0].name.slice(0, 44)}" — BBMP-named)`);
    if (top && !isBbmpNamed(top)) {
      console.log(`            ${STRICT ? "✗ skipped: match is not BBMP-named (--strict)" : "⚠ match is not BBMP-named — worth eyeballing"}`);
    }
    if (!verdict) console.log(`            ✗ ${why || "no candidate passed"}`);

    if (verdict) {
      ok++;
      if (APPLY) {
        await prisma.bbmpSchool.update({
          where: { id: s.id },
          data: { lat: top!.lat, lng: top!.lng, geocodeSource: "google" },
        });
      }
    } else rejected++;
    console.log();
  }

  console.log(`accepted=${ok}  rejected=${rejected}  no-result=${none}`);
  if (APPLY && ok) console.log(`\nWrote ${ok} coordinates. Re-run scripts/import-bbmp-schools.ts --retag to rebuild settlement links.`);
  else if (!APPLY) console.log(`\nDry run. Re-run with --apply to write.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
