/*
# Add volume_data_points table for imported operational data

1. New Tables
- `volume_data_points`
  - `id` (uuid, primary key, default generated)
  - `group_id` (uuid, not null, references assignment_groups on delete cascade)
  - `event_date` (date, not null — the date of the operational event)
  - `day_of_week` (integer 0–6, 0 = Sunday)
  - `hour` (integer 0–23)
  - `count` (integer, default 1 — jobs/units in that hour)
  - `created_at` (timestamp)

2. Indexes
- idx on (group_id, hour) and (group_id, day_of_week) for average queries.

3. Security
- RLS enabled.
- Policies allow anon + authenticated full access because this app has no sign-in
  (single-tenant, intentionally shared data), matching every other table.

4. Purpose
- Stores imported operational data (CSV/Excel rows with timestamps). Averages across
  all accumulated rows drive the automatic "Expected Volume" by hour and the
  weekend multiplier in the Volume Plan. Rows outside current hours of operation are
  retained so expanding hours later includes them.
*/

CREATE TABLE IF NOT EXISTS volume_data_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES assignment_groups(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour int NOT NULL CHECK (hour BETWEEN 0 AND 23),
  count int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vdp_group_hour ON volume_data_points (group_id, hour);
CREATE INDEX IF NOT EXISTS idx_vdp_group_dow ON volume_data_points (group_id, day_of_week);

ALTER TABLE volume_data_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vdp_select" ON volume_data_points;
CREATE POLICY "vdp_select" ON volume_data_points FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "vdp_insert" ON volume_data_points;
CREATE POLICY "vdp_insert" ON volume_data_points FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "vdp_update" ON volume_data_points;
CREATE POLICY "vdp_update" ON volume_data_points FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "vdp_delete" ON volume_data_points;
CREATE POLICY "vdp_delete" ON volume_data_points FOR DELETE TO anon, authenticated USING (true);
