-- Add WeeklyPlanNudge notification type
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WeeklyPlanNudge';

-- Add PitstopPriority enum and column
CREATE TYPE "PitstopPriority" AS ENUM ('High', 'Medium', 'Low');
ALTER TABLE "Pitstop" ADD COLUMN "priority" "PitstopPriority" NOT NULL DEFAULT 'Medium';
