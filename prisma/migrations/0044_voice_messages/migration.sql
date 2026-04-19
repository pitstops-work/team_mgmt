-- Add preferredLang to User
ALTER TABLE "User" ADD COLUMN "preferredLang" TEXT NOT NULL DEFAULT 'en';

-- Add voice/translation fields to Message
ALTER TABLE "Message" ADD COLUMN "msgType"      TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "Message" ADD COLUMN "audioUrl"     TEXT;
ALTER TABLE "Message" ADD COLUMN "originalLang" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Message" ADD COLUMN "translations" JSONB;
