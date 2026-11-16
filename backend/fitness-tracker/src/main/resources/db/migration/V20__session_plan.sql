-- The calendar plan a workout was started from (null: started on its own).
-- Kept on the session so Finish ticks off that plan even after the workout
-- was left and resumed (another device, a reload, past midnight). No
-- foreign key: deleting the plan mustn't touch the workout; Finish then
-- falls back to matching by date.
alter table session add column scheduled_workout_id bigint;
