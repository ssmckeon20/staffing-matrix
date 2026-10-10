/*
# Add employee overtime threshold

1. New Columns
- `team_members.overtime_threshold`: Numeric hours at which this individual employee enters overtime. Existing and new employees default to 40 hours.

2. Modified Tables
- `team_members`: Adds one non-null numeric column with a safe default. No existing columns, rows, assignments, or group data are removed or changed.

3. Security
- No new table or policy is introduced. The existing team_members RLS policies continue to govern this column.

4. Important Notes
- The Team tab will manage this employee-level value.
- Assignment group overtime fields remain in the database for compatibility but are no longer edited from the interface.
*/

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS overtime_threshold numeric NOT NULL DEFAULT 40;