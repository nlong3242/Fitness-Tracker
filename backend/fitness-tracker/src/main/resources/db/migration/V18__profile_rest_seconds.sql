-- The rest timer's length, set in Settings (seconds). Null = the default,
-- 3:00 (UserProfile.DEFAULT_REST_SECONDS), so existing profiles need no
-- backfill.
alter table user_profile add column rest_seconds integer;
