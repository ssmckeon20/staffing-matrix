/*
# Prevent duplicate shift assignments per member per day

1. Problem
- The `shift_assignments` table allowed multiple rows for the same
  (member_id, assignment_date). When duplicates existed, the app's
  save logic (which expects at most one row per member per day)
  failed silently, making scheduled shifts appear to not save.

2. Changes
- Deduplicate existing rows: for each (member_id, assignment_date)
  with more than one row, keep the earliest row and delete exact
  duplicates (identical shift data, so no schedule information is lost).
- Add a UNIQUE constraint on (member_id, assignment_date) so the
  database itself rejects any future duplicate. This makes the app's
  "check then update or insert" save flow always see exactly one row.

3. Security
- No RLS changes; this is a data-integrity constraint only.

4. Notes
- Deduplication only removes rows whose shift_start, shift_end,
  status, and is_published are identical to the kept row. If a
  duplicate differed in any shift data, the constraint would fail;
  in that case review rows manually before re-applying.
*/

DELETE FROM shift_assignments a
USING shift_assignments b
WHERE a.member_id = b.member_id
  AND a.assignment_date = b.assignment_date
  AND a.id > b.id
  AND a.shift_start IS NOT DISTINCT FROM b.shift_start
  AND a.shift_end IS NOT DISTINCT FROM b.shift_end
  AND a.status IS NOT DISTINCT FROM b.status
  AND a.is_published IS NOT DISTINCT FROM b.is_published;

ALTER TABLE shift_assignments
  ADD CONSTRAINT shift_assignments_member_date_unique
  UNIQUE (member_id, assignment_date);
