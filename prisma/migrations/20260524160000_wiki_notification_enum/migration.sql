-- AlterEnum: extend NotificationType with wiki-related kinds
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WikiFlagCreated';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WikiCommentCreated';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WikiWeeklyDigest';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WikiReviewOverdue';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WikiOwnerTermExpiring';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WikiCirclePrompt';
