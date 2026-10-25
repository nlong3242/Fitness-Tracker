-- Built-in exercises put their step-by-step instructions in cues instead
-- of a column of their own, so cues get room for them (here and in the
-- past-session copies). The loader fills them in again at start-up.
alter table exercise drop column instructions;
alter table exercise alter column cues set data type varchar(4000);
alter table session_exercise alter column cues set data type varchar(4000);
