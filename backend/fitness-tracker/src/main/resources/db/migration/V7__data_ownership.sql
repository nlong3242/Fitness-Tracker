-- Every workout, exercise, session, calendar entry and weigh-in belongs to
-- one account. Sets, workout links and session snapshots go with their
-- parent row, so they need no column of their own.
alter table exercise add column user_id bigint;
alter table workout add column user_id bigint;
alter table session add column user_id bigint;
alter table scheduled_workout add column user_id bigint;
alter table body_weight add column user_id bigint;

alter table exercise add constraint fk_exercise_user foreign key (user_id) references app_user;
alter table workout add constraint fk_workout_user foreign key (user_id) references app_user;
alter table session add constraint fk_session_user foreign key (user_id) references app_user;
alter table scheduled_workout add constraint fk_scheduled_workout_user foreign key (user_id) references app_user;
alter table body_weight add constraint fk_body_weight_user foreign key (user_id) references app_user;

-- Data from before accounts goes to the first account made. With no
-- account yet it stays unowned (hidden) until the first sign-up claims it
-- (AuthService).
update exercise set user_id = (select min(id) from app_user) where user_id is null;
update workout set user_id = (select min(id) from app_user) where user_id is null;
update session set user_id = (select min(id) from app_user) where user_id is null;
update scheduled_workout set user_id = (select min(id) from app_user) where user_id is null;
update body_weight set user_id = (select min(id) from app_user) where user_id is null;

-- One weigh-in per day per account, not per day overall.
alter table body_weight drop constraint uk_body_weight_date;
alter table body_weight add constraint uk_body_weight_user_date unique (user_id, date);
