-- An Other category, for exercises that fit none of the muscle groups
-- (here and in the past-session copies). Added last, so the existing
-- values keep their order.
alter table exercise alter column category set data type
    enum ('ARMS','BACK','CHEST','CORE','LEGS','SHOULDERS','OTHER');
alter table session_exercise alter column category set data type
    enum ('ARMS','BACK','CHEST','CORE','LEGS','SHOULDERS','OTHER');
