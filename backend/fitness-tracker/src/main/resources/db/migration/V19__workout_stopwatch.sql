-- Workout stopwatch.
-- When a workout was started (Start tapped, sent by the app) and finished;
-- their difference is the workout's time. Null on sessions from before
-- this, which then show no time.
alter table session add column started_at timestamp(6) with time zone;
alter table session add column finished_at timestamp(6) with time zone;

-- Whether the live workout shows the stopwatch (Settings). Null = on.
-- Hiding it doesn't stop the times above being recorded.
alter table user_profile add column show_workout_timer boolean;
