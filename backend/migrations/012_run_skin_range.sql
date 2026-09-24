-- ============================================
-- Migration: a ranked run may carry any of the eighteen skin codes
-- Description: the loadout's skin scale grew from 0..4 (the four tints) to 0..17 (the sold looks,
--              the boss awards and the Seeker look), and
--              startRun snapshots the equipped code into ranked_runs.skin. 009 declared the 0..4
--              CHECK inline on the column, so its name is whatever Postgres assigned: like 011,
--              it is dropped by lookup (the CHECK constraint attached to the skin column, found by
--              its conkey rather than by matching its definition's text) rather than by name, and
--              the new range is added under the name ranked_runs_skin_check.
-- ============================================

BEGIN;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'ranked_runs'::regclass
       AND con.contype = 'c'
       AND con.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'ranked_runs'::regclass AND attname = 'skin')]
  LOOP
    EXECUTE format('ALTER TABLE ranked_runs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE ranked_runs ADD CONSTRAINT ranked_runs_skin_check CHECK (skin BETWEEN 0 AND 17);

COMMIT;
