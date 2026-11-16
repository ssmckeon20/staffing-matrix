/*
# Add company holidays table

1. New Tables
- `company_holidays`
  - `id` (uuid, primary key, default generated)
  - `holiday_date` (date, not null, unique — one holiday per calendar day)
  - `name` (text, not null — display name, e.g. "Christmas Day")
  - `created_at` (timestamp)

2. Security
- RLS enabled.
- Policies allow anon + authenticated full access because this app has no sign-in
  (single-tenant, intentionally shared data), matching every other table.

3. Purpose
- Holidays defined on the Team tab are highlighted as columns in the By Shift
  grid and the posted Employee Schedule (including print).
*/

CREATE TABLE IF NOT EXISTS company_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE company_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ch_select" ON company_holidays;
CREATE POLICY "ch_select" ON company_holidays FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ch_insert" ON company_holidays;
CREATE POLICY "ch_insert" ON company_holidays FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ch_update" ON company_holidays;
CREATE POLICY "ch_update" ON company_holidays FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ch_delete" ON company_holidays;
CREATE POLICY "ch_delete" ON company_holidays FOR DELETE TO anon, authenticated USING (true);
