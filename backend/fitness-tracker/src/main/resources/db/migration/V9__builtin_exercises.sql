-- Built-in exercises (from free-exercise-db, loaded at start-up by
-- BuiltInExercises): shared by every account and read-only, so they have
-- no user_id. source_id is the dataset's id for the exercise.
alter table exercise add column built_in boolean default false not null;
alter table exercise add column source_id varchar(100);
alter table exercise add column instructions varchar(4000);
alter table exercise add column equipment varchar(50);
alter table exercise add column level varchar(20);
alter table exercise add constraint uk_exercise_source_id unique (source_id);

-- A note on a built-in exercise is personal, so it can't live on the
-- shared row (Custom exercises keep theirs in exercise.notes).
create table exercise_note (
    user_id bigint not null,
    exercise_id bigint not null,
    content varchar(5000) not null,
    primary key (user_id, exercise_id),
    constraint fk_exercise_note_user foreign key (user_id) references app_user,
    constraint fk_exercise_note_exercise foreign key (exercise_id) references exercise
);

-- Built-in exercises someone has taken out of their list ("Delete").
create table exercise_hidden (
    user_id bigint not null,
    exercise_id bigint not null,
    primary key (user_id, exercise_id),
    constraint fk_exercise_hidden_user foreign key (user_id) references app_user,
    constraint fk_exercise_hidden_exercise foreign key (exercise_id) references exercise
);
