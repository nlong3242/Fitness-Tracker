-- How an exercise's sets are logged (LogType): weight & reps (what every
-- set has been so far), reps, time, or distance & time. Plain text rather
-- than an enum, so a new type needs no migration. Everything already here
-- is weight & reps.
alter table exercise add column log_type varchar(20) default 'WEIGHT_REPS' not null;
-- A change made while the exercise is in a workout being done; applied
-- when that workout is finished or discarded.
alter table exercise add column pending_log_type varchar(20);

-- Past sessions and sets keep the type they were logged with, so a later
-- change doesn't reinterpret them.
alter table session_exercise add column log_type varchar(20) default 'WEIGHT_REPS' not null;
alter table exercise_set add column log_type varchar(20) default 'WEIGHT_REPS' not null;

-- Time and Distance & time sets. Numbers a type doesn't use stay empty
-- (weight and reps stay 0).
alter table exercise_set add column duration_seconds integer;
alter table exercise_set add column distance_km float(53);

-- A Cardio category (always Distance & time). Added last, as V11 did.
alter table exercise alter column category set data type
    enum ('ARMS','BACK','CHEST','CORE','LEGS','SHOULDERS','OTHER','CARDIO');
alter table session_exercise alter column category set data type
    enum ('ARMS','BACK','CHEST','CORE','LEGS','SHOULDERS','OTHER','CARDIO');
