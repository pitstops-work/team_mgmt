-- Partner login: optionally link a GrantPartner (grantee org) to a User account
-- (role "partner") so the grantee can sign in and file their own reports.

ALTER TABLE "GrantPartner" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "GrantPartner_userId_key" ON "GrantPartner"("userId");
ALTER TABLE "GrantPartner"
  ADD CONSTRAINT "GrantPartner_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
