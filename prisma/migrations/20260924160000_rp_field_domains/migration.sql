-- Optional per-RP domain scoping for /field.
--
-- /field is cluster-scoped: an RP sees every intervention in their clusters,
-- across all domains. That assumed cluster-generalist RPs, and the team is not
-- shaped that way — of 16 owners only one works a single cluster, two are pure
-- domain specialists spanning five clusters each, and nine run several domains
-- across several clusters. 16 of 24 clusters hold more than one domain.
--
-- So a creche RP working five clusters had no way to be expressed: assigning
-- the clusters handed them the welfare, toilet and children's-centre work too.
--
-- Purely additive: one join table. An EMPTY set means unrestricted, so existing
-- users are unaffected and the original behaviour is the default.
--
-- (Pre-existing live-DB drift is intentionally NOT included here. Same
-- exclusion as 20260812090000 and 20260924120000.)

-- CreateTable
CREATE TABLE "_RPFieldDomains" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RPFieldDomains_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RPFieldDomains_B_index" ON "_RPFieldDomains"("B");

-- AddForeignKey
ALTER TABLE "_RPFieldDomains" ADD CONSTRAINT "_RPFieldDomains_A_fkey" FOREIGN KEY ("A") REFERENCES "FieldDomainConfig"("domain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RPFieldDomains" ADD CONSTRAINT "_RPFieldDomains_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
