-- Budget reporting: (1) structured FD details in the APF format, (2) legal
-- finance-declaration capture at submit. All additive.

-- Declaration audit columns on BudgetReport.
ALTER TABLE "BudgetReport"
  ADD COLUMN "declarationAcceptedAt"    TIMESTAMP(3),
  ADD COLUMN "declarationAcceptedById"  TEXT,
  ADD COLUMN "declarationSnapshot"      JSONB,
  ADD COLUMN "declarationHash"          TEXT,
  ADD COLUMN "declarationIp"            TEXT,
  ADD COLUMN "declarationUserAgent"     TEXT,
  ADD COLUMN "declarationSignedScanUrl" TEXT;

-- One row per fixed deposit held during the reporting period.
CREATE TABLE "BudgetReportFd" (
    "id"               TEXT NOT NULL,
    "reportId"         TEXT NOT NULL,
    "sortOrder"        INTEGER NOT NULL DEFAULT 0,
    "bankName"         TEXT NOT NULL DEFAULT '',
    "fdrNumber"        TEXT NOT NULL DEFAULT '',
    "faceValue"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maturityValue"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cumulative"       BOOLEAN NOT NULL DEFAULT true,
    "doi"              TIMESTAMP(3),
    "dom"              TIMESTAMP(3),
    "roi"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalance"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestAccrued"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tds"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maturedAmount"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maturityDate"     TIMESTAMP(3),
    "closingBalance"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BudgetReportFd_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BudgetReportFd_reportId_idx" ON "BudgetReportFd"("reportId");
ALTER TABLE "BudgetReportFd"
  ADD CONSTRAINT "BudgetReportFd_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "BudgetReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
