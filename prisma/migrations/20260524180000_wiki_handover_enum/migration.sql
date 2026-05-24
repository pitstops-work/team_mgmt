-- AlterEnum: extend NotificationType for handover + term expiry kinds
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WikiOwnerTermExpired';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WikiHandoverProposed';
