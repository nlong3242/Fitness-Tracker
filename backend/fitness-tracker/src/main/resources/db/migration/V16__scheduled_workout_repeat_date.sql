-- The repeat day a calendar entry was made from (WorkoutRepeat). Acting on
-- a repeat day (start, skip, note, move) saves a normal entry that keeps
-- the day here, so the rule stops planning that day even after the entry
-- is moved to another date. Null for entries planned by hand.
alter table scheduled_workout add column repeat_date date;
