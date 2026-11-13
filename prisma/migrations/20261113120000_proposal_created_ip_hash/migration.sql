-- Throttling an unauthenticated endpoint.
--
-- The public application form is the first endpoint in this app that writes a
-- row without a session behind it, and there is no rate limiting anywhere in
-- the codebase. Without something, the proposal table is a public write target.
--
-- A salted SHA-256 of the submitting IP rather than the IP: the throttle only
-- needs to know that two submissions came from the same place, and an
-- applicant's address sitting in a table nobody prunes is a liability with no
-- offsetting use. The salt is NEXTAUTH_SECRET, so the hashes are not reversible
-- by rainbow table against the 2^32 IPv4 space.
--
-- Additive: one nullable column and one index, no backfill.

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "createdIpHash" TEXT;

-- CreateIndex
CREATE INDEX "Proposal_createdIpHash_createdAt_idx" ON "Proposal"("createdIpHash", "createdAt");
