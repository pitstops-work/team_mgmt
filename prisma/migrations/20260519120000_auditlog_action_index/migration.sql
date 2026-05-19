-- Index on AuditLog(action, createdAt) for filtering sensitive-action audit queries
-- (e.g., "all role_change events in the last 30 days").
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx"
  ON "AuditLog" ("action", "createdAt");
