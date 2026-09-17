-- ============================================
-- Migration: an out-of-date app must not spend a ranked attempt
-- Description: finishRun closes a run whose replay carries another CORE_VERSION with the status
--              'update_required' instead of 'rejected', and countRunsForDay skips that status, so
--              the attempt - free or bought - survives a core version bump. Runs left in 'started'
--              keep counting: abandoning a run must not refund it. The status CHECK from 005 has to
--              allow the new value; it was declared inline on the column, so its name is whatever
--              Postgres assigned and it is dropped by lookup rather than by name.
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
       AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE ranked_runs DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE ranked_runs ADD CONSTRAINT ranked_runs_status_check
  CHECK (status IN ('started', 'verified', 'rejected', 'update_required'));

COMMIT;
