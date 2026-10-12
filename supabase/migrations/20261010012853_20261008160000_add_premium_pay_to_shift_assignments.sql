/*
# Add premium pay fields to shift assignments

1. New Columns
- `shift_assignments.premium_pay_type`: Tracks which premium pay calculation to use. Values: 'base_plus', 'rate_plus_percent', 'other', or NULL.
- `shift_assignments.premium_pay_amount`: The numeric amount for the premium calculation (added dollars, percentage, or custom hourly rate).

2. Modified Tables
- `shift_assignments`: Adds two nullable columns. No existing data is changed.

3. Security
- No new policies. Existing shift_assignments RLS policies govern these columns.
*/

ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS premium_pay_type text,
  ADD COLUMN IF NOT EXISTS premium_pay_amount numeric;