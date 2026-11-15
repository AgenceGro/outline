DO $preflight$
BEGIN
  IF to_regclass('teams') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM teams OFFSET 1) THEN
      RAISE EXCEPTION 'Multiple workspaces (including pending deletions). Separate or consolidate them before upgrading. No changes made.';
    END IF;
  END IF;
END
$preflight$;
