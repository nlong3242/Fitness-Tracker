-- The dataset's "e-z curl bar" is shown as "EZ Bar" (BuiltInExercises
-- renames it for built-ins at start-up); Custom ones saved with the old
-- spelling follow.
update exercise set equipment = 'EZ Bar' where equipment = 'E-z curl bar';
