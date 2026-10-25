-- One profile per account, filled in once after sign-up (the app asks
-- until there is one). Only the name is required.
create table user_profile (
    user_id bigint not null,
    display_name varchar(40) not null,
    birth_date date,
    height_cm integer,
    weekly_goal integer,
    updated_at timestamp(6) not null,
    primary key (user_id),
    constraint fk_user_profile_user foreign key (user_id) references app_user
);
