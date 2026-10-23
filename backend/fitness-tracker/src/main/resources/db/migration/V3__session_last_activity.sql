-- When a session last had a set logged/edited/deleted (or was created).
-- The app ends a workout automatically after enough idle time.
ALTER TABLE session ADD COLUMN last_activity_at TIMESTAMP(6) WITH TIME ZONE;

-- Sessions already in progress get a fresh window from now, rather than
-- looking idle since midnight of their date and ending on first launch.
UPDATE session SET last_activity_at = CURRENT_TIMESTAMP WHERE finished = FALSE;
