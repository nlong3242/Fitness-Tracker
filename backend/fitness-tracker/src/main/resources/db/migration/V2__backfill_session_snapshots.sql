-- Replaces SessionSnapshotMigration.java: for every session that has no
-- snapshot rows, mark it finished and create one session_exercise per
-- distinct exercise referenced by its sets (ordered by first set id).
-- The update must run first: both statements target "sessions without
-- snapshots", and the insert changes which sessions match.

update session s
set finished = true
where s.finished = false
  and not exists (
      select 1 from session_exercise se where se.session_id = s.id
  );

insert into session_exercise
    (session_id, exercise_id, position, name, category,
     primary_muscle_groups, exercise_type, cues, unilateral)
select
    fs.session_id,
    fs.exercise_id,
    row_number() over (partition by fs.session_id order by fs.first_set_id) - 1,
    e.name, e.category, e.primary_muscle_groups, e.exercise_type,
    e.cues, e.unilateral
from (
    select es.session_id, es.exercise_id, min(es.id) as first_set_id
    from exercise_set es
    where es.exercise_id is not null
    group by es.session_id, es.exercise_id
) fs
join exercise e on e.id = fs.exercise_id
where not exists (
    select 1 from session_exercise se where se.session_id = fs.session_id
);
