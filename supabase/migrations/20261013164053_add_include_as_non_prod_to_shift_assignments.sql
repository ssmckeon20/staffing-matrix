/*
# Add include_as_non_prod column to shift_assignments

1. Modified Tables
- `shift_assignments`: Added `include_as_non_prod` boolean column (defaults to false).
  When true, hours from this assignment (PTO, LOA, Vacation) count toward
  non-productive totals in the staffing matrix FTE calculations.

2. Security
- No changes to RLS policies. The column is writable by the same roles that
  already have INSERT/UPDATE access on shift_assignments.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shift_assignments'
    AND column_name = 'include_as_non_prod'
  ) THEN
    ALTER TABLE shift_assignments
    ADD COLUMN include_as_non_prod boolean NOT NULL DEFAULT false;
  END IF;
END $$;
