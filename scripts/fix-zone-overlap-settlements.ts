// Corrects 5 mislocated/duplicate settlements that created absurd cross-zone
// overlaps on the Programme Map (zones are derived from settlement 750m buffers).
// Decisions confirmed with Vishnu 2026-06-12:
//   1. Narayanapura [West/Dasarahalli]  -> delete (duplicate of South/Anekal)
//   2. AK Colony [South/Anekal]          -> delete (duplicate of Subhashnagar (HP))
//   3. Shastri Nagar [North/Majestic]    -> re-tag into South/Koramangala cluster
//      Shastri Nagar [South/Koramangala] -> delete (empty null-coords stub)
//
// Idempotent: skips records already deleted/re-tagged. Soft-delete only (reversible).
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL!, max: 1 });

const DELETE_IDS = [
  { id: "cmnsyczwe003liyvcjiwum188", label: "Narayanapura [West/Dasarahalli]" },
  { id: "cmnsycu69001niyvcvia6wz7r", label: "AK Colony [South/Anekal]" },
  { id: "cmnsyd5tw005kiyvcikxu46di", label: "Shastri Nagar [South/Koramangala] (empty stub)" },
];

const SHASTRI_NORTH_ID = "cmnsyd94s006piyvcq9qtizw9";       // record WITH coords + polygon
const KORAMANGALA_CLUSTER_ID = "cmnsyd50m005aiyvcu793n82u"; // South/Koramangala cluster

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Re-tag Shastri Nagar (with coords) into Koramangala FIRST, so the stub
    // delete below leaves exactly one Koramangala record.
    const retag = await client.query(
      `UPDATE "Settlement" SET "clusterId" = $1, "updatedAt" = now()
       WHERE id = $2 AND "deletedAt" IS NULL AND "clusterId" <> $1
       RETURNING name`,
      [KORAMANGALA_CLUSTER_ID, SHASTRI_NORTH_ID],
    );
    console.log(
      retag.rowCount
        ? `Re-tagged Shastri Nagar (${SHASTRI_NORTH_ID}) -> South/Koramangala cluster`
        : `Shastri Nagar re-tag skipped (already in Koramangala or deleted)`,
    );

    for (const { id, label } of DELETE_IDS) {
      const res = await client.query(
        `UPDATE "Settlement" SET "deletedAt" = now()
         WHERE id = $1 AND "deletedAt" IS NULL RETURNING name`,
        [id],
      );
      console.log(res.rowCount ? `Soft-deleted ${label}` : `Skipped ${label} (already deleted)`);
    }

    await client.query("COMMIT");
    console.log("\nCommitted. Derived zone_geometry / cluster_geometry views will reflect this immediately.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
