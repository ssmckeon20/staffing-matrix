/*
# Add "Training" shift status

1. Modified Tables
- `shift_assignments`: The `status` column check constraint previously allowed only
  'Scheduled', 'Off', 'PTO', 'LOA', 'Vacation'. It now also allows 'Training',
  so a shift can be marked as a training assignment in the staffing matrix.

2. Data Safety
- No data is dropped or changed. The old constraint is replaced by a new one that
  is a superset of the old allowed values, so every existing row remains valid.

3. Security
- No RLS or privilege changes.
*/

ALTER TABLE shift_assignments DROP CONSTRAINT IF EXISTS shift_assignments_status_check;

ALTER TABLE shift_assignments
  ADD CONSTRAINT shift_assignments_status_check
  CHECK (status IN ('Scheduled', 'Off', 'PTO', 'LOA', 'Vacation', 'Training'));
