/*
# Add shift_override_break column to shift_assignments

1. Modified Tables
- `shift_assignments`: Added `shift_override_break` numeric column (nullable).
  When set, this value overrides the employee's default daily_unpaid_break
  for calculating paid hours on this specific shift. When null, the
  employee's default break from the team_members table is used.

2. Security
- No changes to RLS policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shift_assignments'
    AND column_name = 'shift_override_break'
  ) THEN
    ALTER TABLE shift_assignments
    ADD COLUMN shift_override_break numeric(4,2);
  END IF;
END $$;
