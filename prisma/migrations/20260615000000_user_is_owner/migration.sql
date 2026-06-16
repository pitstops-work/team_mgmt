-- User.isOwner — "primordial" super-admin marker for asymmetric protection.
--
--   Only the owner can mint new super-admins (POST/PATCH guard).
--   No other super-admin (or admin) can demote, delete, or reset the
--   password of the owner (PATCH/DELETE/reset-password guards).
--   The owner can still demote anyone else, including other super-admins.
--   To transfer or relinquish ownership, do it via direct SQL — there is
--   no in-app UX for this on purpose (the event happens ~once in 5 years).

ALTER TABLE "User"
  ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

-- Seed the current owner. Hard-coded email so the backfill is deterministic
-- and idempotent on re-runs. Replace via SQL if ownership ever changes.
UPDATE "User" SET "isOwner" = true WHERE email = 'kotlerster@gmail.com';
