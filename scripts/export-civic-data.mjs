import pg from 'pg';
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;

const DB_URL = "postgresql://neondb_owner:npg_YUQet8y5GWov@ep-lingering-waterfall-a1xc3pu6.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const client = new Client({ connectionString: DB_URL });
await client.connect();

const { rows } = await client.query(`
  SELECT
    s.id                          AS settlement_id,
    s.name                        AS settlement_name,
    c.name                        AS cluster_name,
    z.name                        AS zone_name,
    ci.name                       AS city_name,
    mp.label                      AS partner_name,
    cd."borewell",
    cd."toiletConnection",
    cd."toiletFacility",
    cd."waterSupply",
    cd."borewellNeedScore"        AS borewell_need_score,
    cd."toiletConnNeedScore"      AS toilet_conn_need_score,
    cd."toiletFacNeedScore"       AS toilet_fac_need_score,
    cd."waterSupplyNeedScore"     AS water_supply_need_score
  FROM "Settlement" s
  JOIN "Cluster" c  ON c.id = s."clusterId"
  JOIN "Zone"    z  ON z.id = c."zoneId"
  JOIN "City"    ci ON ci.id = z."cityId"
  LEFT JOIN "MapPartner" mp ON mp.id = s."partnerId"
  LEFT JOIN "SettlementCivicData" cd ON cd."settlementId" = s.id
  WHERE s."deletedAt" IS NULL
  ORDER BY ci.name, z.name, c.name, s.name
`);

await client.end();

// ── Build workbook ────────────────────────────────────────────────────────────

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Civic Data');

// Header style helpers
const hdrFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const hdrFont = (bold = true) => ({ name: 'Calibri', size: 10, bold, color: { argb: 'FF000000' } });
const border = { style: 'thin', color: { argb: 'FFD0D0D0' } };
const allBorder = { top: border, left: border, bottom: border, right: border };

// Column definitions
// Groups: Identity | Borewell | Toilet Connection | Toilet Facility | Water Supply | Need Scores
const cols = [
  // Identity
  { header: 'City',             key: 'city',        width: 14 },
  { header: 'Zone',             key: 'zone',        width: 18 },
  { header: 'Cluster',          key: 'cluster',     width: 22 },
  { header: 'Settlement',       key: 'settlement',  width: 28 },
  { header: 'Partner',          key: 'partner',     width: 22 },

  // Borewell (% HH)
  { header: 'Individual %',     key: 'bw_individual',     width: 13 },
  { header: 'Public %',         key: 'bw_public',         width: 11 },
  { header: 'Shared %',         key: 'bw_shared',         width: 11 },
  { header: 'Private Tanker %', key: 'bw_privateTanker',  width: 16 },
  { header: 'N/A %',            key: 'bw_na',             width: 9  },
  { header: 'Need Score',       key: 'bw_need',           width: 12 },

  // Toilet Connection (% HH)
  { header: 'Sewerage %',       key: 'tc_sewerage',       width: 13 },
  { header: 'Soak Pit %',       key: 'tc_soakPit',        width: 12 },
  { header: 'No Sewerage %',    key: 'tc_noSewerage',     width: 14 },
  { header: 'Need Score',       key: 'tc_need',           width: 12 },

  // Toilet Facility (% HH)
  { header: 'Individual %',     key: 'tf_individual',     width: 13 },
  { header: 'Shared %',         key: 'tf_shared',         width: 11 },
  { header: 'Public %',         key: 'tf_public',         width: 11 },
  { header: 'Public Paid %',    key: 'tf_publicPaid',     width: 13 },
  { header: 'No Facility %',    key: 'tf_noFacility',     width: 13 },
  { header: 'Need Score',       key: 'tf_need',           width: 12 },

  // Water Supply (% HH)
  { header: 'Individual %',     key: 'ws_individual',     width: 13 },
  { header: 'Shared %',         key: 'ws_shared',         width: 11 },
  { header: 'Public %',         key: 'ws_public',         width: 11 },
  { header: 'Private Tanker %', key: 'ws_privateTanker',  width: 16 },
  { header: 'Need Score',       key: 'ws_need',           width: 12 },
];

ws.columns = cols;

// ── Group header row (row 1) ──────────────────────────────────────────────────
const groupRow = ws.getRow(1);
const groups = [
  { label: '',                   start: 1, end: 5,  argb: 'FFFFFFFF' },
  { label: 'Borewell',           start: 6, end: 11, argb: 'FFDBEAFE' },
  { label: 'Toilet Connection',  start: 12, end: 15, argb: 'FFD1FAE5' },
  { label: 'Toilet Facility',    start: 16, end: 21, argb: 'FFFEF9C3' },
  { label: 'Water Supply',       start: 22, end: 26, argb: 'FFFCE7F3' },
];

for (const g of groups) {
  const cell = groupRow.getCell(g.start);
  cell.value = g.label;
  cell.font = { name: 'Calibri', size: 10, bold: true };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.fill = hdrFill(g.argb);
  if (g.end > g.start) ws.mergeCells(1, g.start, 1, g.end);
}
groupRow.height = 18;

// ── Column header row (row 2) ────────────────────────────────────────────────
const headerRow = ws.getRow(2);
const groupArgb = ['FFFFFFFF','FFFFFFFF','FFFFFFFF','FFFFFFFF','FFFFFFFF',
  'FFDBEAFE','FFDBEAFE','FFDBEAFE','FFDBEAFE','FFDBEAFE','FFDBEAFE',
  'FFD1FAE5','FFD1FAE5','FFD1FAE5','FFD1FAE5',
  'FFFEF9C3','FFFEF9C3','FFFEF9C3','FFFEF9C3','FFFEF9C3','FFFEF9C3',
  'FFFCE7F3','FFFCE7F3','FFFCE7F3','FFFCE7F3','FFFCE7F3',
];

cols.forEach((col, i) => {
  const cell = headerRow.getCell(i + 1);
  cell.value = col.header;
  cell.font = hdrFont(true);
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.fill = hdrFill(groupArgb[i] || 'FFFFFFFF');
  cell.border = allBorder;
});
headerRow.height = 30;

// Freeze rows 1+2 and first 4 cols
ws.views = [{ state: 'frozen', xSplit: 4, ySplit: 2, activeCell: 'E3' }];

// ── Data rows ─────────────────────────────────────────────────────────────────
const pct = (v) => (v == null ? '' : Math.round(v * 10) / 10);
const score = (v) => (v == null ? '' : Math.round(v * 10) / 10);

for (const r of rows) {
  const bw  = r.borewell          || {};
  const tc  = r.toiletConnection  || {};
  const tf  = r.toiletFacility    || {};
  const ws2 = r.waterSupply       || {};

  const dataRow = ws.addRow([
    r.city_name,
    r.zone_name,
    r.cluster_name,
    r.settlement_name,
    r.partner_name || '—',

    pct(bw.individual),
    pct(bw.public),
    pct(bw.shared),
    pct(bw.privateTanker),
    pct(bw.na),
    score(r.borewell_need_score),

    pct(tc.sewerage),
    pct(tc.soakPit),
    pct(tc.noSewerage),
    score(r.toilet_conn_need_score),

    pct(tf.individual),
    pct(tf.shared),
    pct(tf.public),
    pct(tf.publicPaid),
    pct(tf.noFacility),
    score(r.toilet_fac_need_score),

    pct(ws2.individual),
    pct(ws2.shared),
    pct(ws2.public),
    pct(ws2.privateTanker),
    score(r.water_supply_need_score),
  ]);

  // Zebra-stripe identity cells
  const isEven = dataRow.number % 2 === 0;
  for (let i = 1; i <= 5; i++) {
    const c = dataRow.getCell(i);
    c.font = { name: 'Calibri', size: 10 };
    if (isEven) c.fill = hdrFill('FFF8F8F8');
  }
  // Number formatting for data cols
  for (let i = 6; i <= 26; i++) {
    const c = dataRow.getCell(i);
    c.font = { name: 'Calibri', size: 10 };
    c.alignment = { horizontal: 'center' };
    if (typeof c.value === 'number') c.numFmt = '0.0';
    // Highlight need score cols
    const isNeedCol = [11, 15, 21, 26].includes(i);
    if (isNeedCol && typeof c.value === 'number') {
      const v = c.value;
      if (v >= 70) c.fill = hdrFill('FFFEE2E2');       // high need — red tint
      else if (v >= 40) c.fill = hdrFill('FFFEF9C3');  // medium — yellow
      else if (v > 0) c.fill = hdrFill('FFD1FAE5');    // low — green
    }
  }
  dataRow.height = 16;
}

// ── Auto-filter on header row ─────────────────────────────────────────────────
ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 26 } };

// ── Write file ────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'civic-domain-data.xlsx');
await wb.xlsx.writeFile(outPath);
console.log(`Written: ${outPath}`);
console.log(`Rows: ${rows.length} settlements`);
