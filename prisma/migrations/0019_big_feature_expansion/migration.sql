-- New notification types
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CheckinReminder';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EscalationAlert';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BroadcastUpdate';

-- New enums
CREATE TYPE "CheckinStatus"   AS ENUM ('OnTrack', 'AtRisk', 'Blocked', 'Done');
CREATE TYPE "DecisionStatus"  AS ENUM ('Open', 'Made', 'Reversed');
CREATE TYPE "RiskLikelihood"  AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE "RiskImpact"      AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE "RiskStatus"      AS ENUM ('Open', 'Mitigated', 'Closed');
CREATE TYPE "MetricFrequency" AS ENUM ('Daily', 'Weekly', 'Monthly', 'Quarterly');

-- New columns on existing tables
ALTER TABLE "User"    ADD COLUMN "weeklyCapacity" DOUBLE PRECISION NOT NULL DEFAULT 40;
ALTER TABLE "Pitstop" ADD COLUMN "estimatedHours" DOUBLE PRECISION;

-- ── Accountability ────────────────────────────────────────────────────────────

CREATE TABLE "PitstopCheckin" (
    "id"        TEXT NOT NULL,
    "pitstopId" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "date"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"    "CheckinStatus" NOT NULL,
    "note"      TEXT,
    "nextSteps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PitstopCheckin_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PitstopCheckin" ADD CONSTRAINT "PitstopCheckin_pitstopId_fkey" FOREIGN KEY ("pitstopId") REFERENCES "Pitstop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PitstopCheckin" ADD CONSTRAINT "PitstopCheckin_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "User"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Retrospective" (
    "id"           TEXT NOT NULL,
    "entityType"   TEXT NOT NULL,
    "entityId"     TEXT NOT NULL,
    "authorId"     TEXT NOT NULL,
    "wentWell"     TEXT,
    "couldImprove" TEXT,
    "keyLearning"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Retrospective_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Retrospective" ADD CONSTRAINT "Retrospective_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StandupLog" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "date"      TIMESTAMP(3) NOT NULL,
    "yesterday" TEXT,
    "today"     TEXT,
    "blockers"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StandupLog_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "StandupLog" ADD CONSTRAINT "StandupLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StandupLogPitstop" (
    "standupLogId" TEXT NOT NULL,
    "pitstopId"    TEXT NOT NULL,
    CONSTRAINT "StandupLogPitstop_pkey" PRIMARY KEY ("standupLogId", "pitstopId")
);
ALTER TABLE "StandupLogPitstop" ADD CONSTRAINT "StandupLogPitstop_standupLogId_fkey" FOREIGN KEY ("standupLogId") REFERENCES "StandupLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StandupLogPitstop" ADD CONSTRAINT "StandupLogPitstop_pitstopId_fkey"    FOREIGN KEY ("pitstopId")    REFERENCES "Pitstop"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Escalation ────────────────────────────────────────────────────────────────

CREATE TABLE "PitstopEscalation" (
    "id"            TEXT NOT NULL,
    "pitstopId"     TEXT NOT NULL,
    "escalatedById" TEXT NOT NULL,
    "escalatedToId" TEXT NOT NULL,
    "note"          TEXT,
    "resolvedAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PitstopEscalation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PitstopEscalation" ADD CONSTRAINT "PitstopEscalation_pitstopId_fkey"     FOREIGN KEY ("pitstopId")     REFERENCES "Pitstop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PitstopEscalation" ADD CONSTRAINT "PitstopEscalation_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "User"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PitstopEscalation" ADD CONSTRAINT "PitstopEscalation_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "User"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Co-ownership ──────────────────────────────────────────────────────────────

CREATE TABLE "PitstopCoOwner" (
    "pitstopId" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    CONSTRAINT "PitstopCoOwner_pkey" PRIMARY KEY ("pitstopId", "userId")
);
ALTER TABLE "PitstopCoOwner" ADD CONSTRAINT "PitstopCoOwner_pitstopId_fkey" FOREIGN KEY ("pitstopId") REFERENCES "Pitstop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PitstopCoOwner" ADD CONSTRAINT "PitstopCoOwner_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "User"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GoalCoOwner" (
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "GoalCoOwner_pkey" PRIMARY KEY ("goalId", "userId")
);
ALTER TABLE "GoalCoOwner" ADD CONSTRAINT "GoalCoOwner_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalCoOwner" ADD CONSTRAINT "GoalCoOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Decision Log ──────────────────────────────────────────────────────────────

CREATE TABLE "Decision" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "rationale"   TEXT,
    "status"      "DecisionStatus" NOT NULL DEFAULT 'Open',
    "decidedAt"   TIMESTAMP(3),
    "goalId"      TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_goalId_fkey"      FOREIGN KEY ("goalId")      REFERENCES "Goal"("id") ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Audit Trail ───────────────────────────────────────────────────────────────

CREATE TABLE "AuditLog" (
    "id"         TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId"   TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "action"     TEXT NOT NULL,
    "field"      TEXT,
    "oldValue"   TEXT,
    "newValue"   TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Risk Registry ─────────────────────────────────────────────────────────────

CREATE TABLE "Risk" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "likelihood"  "RiskLikelihood" NOT NULL DEFAULT 'Medium',
    "impact"      "RiskImpact"     NOT NULL DEFAULT 'Medium',
    "mitigation"  TEXT,
    "status"      "RiskStatus"     NOT NULL DEFAULT 'Open',
    "goalId"      TEXT,
    "pitstopId"   TEXT,
    "createdById" TEXT NOT NULL,
    "deletedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_goalId_fkey"      FOREIGN KEY ("goalId")      REFERENCES "Goal"("id")    ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_pitstopId_fkey"   FOREIGN KEY ("pitstopId")   REFERENCES "Pitstop"("id") ON DELETE SET NULL  ON UPDATE CASCADE;
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Broadcast Updates ─────────────────────────────────────────────────────────

CREATE TABLE "GoalBroadcast" (
    "id"        TEXT NOT NULL,
    "goalId"    TEXT NOT NULL,
    "authorId"  TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalBroadcast_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "GoalBroadcast" ADD CONSTRAINT "GoalBroadcast_goalId_fkey"   FOREIGN KEY ("goalId")   REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalBroadcast" ADD CONSTRAINT "GoalBroadcast_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Metrics / KPIs ────────────────────────────────────────────────────────────

CREATE TABLE "GoalMetric" (
    "id"          TEXT NOT NULL,
    "goalId"      TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "target"      DOUBLE PRECISION NOT NULL,
    "current"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit"        TEXT,
    "frequency"   "MetricFrequency" NOT NULL DEFAULT 'Monthly',
    "deletedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalMetric_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "GoalMetric" ADD CONSTRAINT "GoalMetric_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MetricDataPoint" (
    "id"        TEXT NOT NULL,
    "metricId"  TEXT NOT NULL,
    "value"     DOUBLE PRECISION NOT NULL,
    "note"      TEXT,
    "date"      TIMESTAMP(3) NOT NULL,
    "userId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetricDataPoint_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "MetricDataPoint" ADD CONSTRAINT "MetricDataPoint_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "GoalMetric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetricDataPoint" ADD CONSTRAINT "MetricDataPoint_userId_fkey"   FOREIGN KEY ("userId")   REFERENCES "User"("id")      ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Themes ────────────────────────────────────────────────────────────────────

CREATE TABLE "Theme" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "color"       TEXT,
    "deletedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoalTheme" (
    "goalId"  TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    CONSTRAINT "GoalTheme_pkey" PRIMARY KEY ("goalId", "themeId")
);
ALTER TABLE "GoalTheme" ADD CONSTRAINT "GoalTheme_goalId_fkey"  FOREIGN KEY ("goalId")  REFERENCES "Goal"("id")  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalTheme" ADD CONSTRAINT "GoalTheme_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Geography ─────────────────────────────────────────────────────────────────

CREATE TABLE "Zone" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Cluster" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "zoneId"    TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cluster_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Cluster" ADD CONSTRAINT "Cluster_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Settlement" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GoalZone" (
    "goalId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    CONSTRAINT "GoalZone_pkey" PRIMARY KEY ("goalId", "zoneId")
);
ALTER TABLE "GoalZone" ADD CONSTRAINT "GoalZone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalZone" ADD CONSTRAINT "GoalZone_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GoalCluster" (
    "goalId"    TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    CONSTRAINT "GoalCluster_pkey" PRIMARY KEY ("goalId", "clusterId")
);
ALTER TABLE "GoalCluster" ADD CONSTRAINT "GoalCluster_goalId_fkey"    FOREIGN KEY ("goalId")    REFERENCES "Goal"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalCluster" ADD CONSTRAINT "GoalCluster_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GoalSettlement" (
    "goalId"       TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    CONSTRAINT "GoalSettlement_pkey" PRIMARY KEY ("goalId", "settlementId")
);
ALTER TABLE "GoalSettlement" ADD CONSTRAINT "GoalSettlement_goalId_fkey"       FOREIGN KEY ("goalId")       REFERENCES "Goal"("id")       ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalSettlement" ADD CONSTRAINT "GoalSettlement_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Quarterly Planning ────────────────────────────────────────────────────────

CREATE TABLE "Quarter" (
    "id"        TEXT NOT NULL,
    "year"      INTEGER NOT NULL,
    "quarter"   INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate"   TIMESTAMP(3) NOT NULL,
    "focus"     TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quarter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Quarter_year_quarter_key" UNIQUE ("year", "quarter")
);

CREATE TABLE "GoalQuarter" (
    "goalId"    TEXT NOT NULL,
    "quarterId" TEXT NOT NULL,
    CONSTRAINT "GoalQuarter_pkey" PRIMARY KEY ("goalId", "quarterId")
);
ALTER TABLE "GoalQuarter" ADD CONSTRAINT "GoalQuarter_goalId_fkey"    FOREIGN KEY ("goalId")    REFERENCES "Goal"("id")    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalQuarter" ADD CONSTRAINT "GoalQuarter_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "Quarter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
