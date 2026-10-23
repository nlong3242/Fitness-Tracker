-- One calendar entry per (date, workout) made a second same-day session of
-- a workout take over the first one's COMPLETED entry, leaving the first
-- session off the calendar. COMPLETED entries are now unlimited (each still
-- links one session: session_id stays unique); "at most one PLANNED/SKIPPED
-- entry per date and workout" is enforced in ScheduledWorkoutController,
-- since H2 has no partial unique indexes.
ALTER TABLE scheduled_workout DROP CONSTRAINT uk_scheduled_workout_date_workout;

-- Give every finished session that lost its entry that way a COMPLETED one
-- back. (Deleting a COMPLETED entry deletes its session too, so a finished
-- session without an entry can only come from the old constraint.)
INSERT INTO scheduled_workout (date, workout_id, status, session_id, created_at)
SELECT s.date, s.workout_id, 'COMPLETED', s.id, CURRENT_TIMESTAMP
FROM session s
WHERE s.finished = TRUE
  AND s.date IS NOT NULL
  AND s.workout_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM scheduled_workout sw WHERE sw.session_id = s.id);
