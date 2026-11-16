/*
# Create schedule templates tables

1. Plain-English summary
Adds a reusable schedule-template system for the Staffing Matrix. A template
captures all shift assignments in a chosen period, anchored to day-of-week and
offset-from-period-start (not fixed calendar dates), so it can be re-applied to
any future pay period. Templates belong to a single assignment group within a
Site (cost center). Only Site owners and admins can see, save, apply, rename,
replace, or delete templates — viewers get no access at all.

2. New Tables
- `schedule_templates`
  - id (uuid, primary key)
  - site_id (uuid, references sites, cascade delete) — tenant scope
  - group_id (uuid, references assignment_groups, cascade delete) — which team
  - name (text, not null)
  - period_length_days (int, not null) — length of the saved period (e.g. 14)
  - start_day_of_week (int, 0–6) — day-of-week of period start (anchor)
  - created_by (uuid, nullable) — account that created it
  - created_at, updated_at (timestamps)
  - UNIQUE(group_id, name) — no duplicate template names within a group
- `schedule_template_rows`
  - id (uuid, primary key)
  - site_id (uuid, references sites, cascade delete) — tenant scope
  - template_id (uuid, references schedule_templates, cascade delete)
  - member_id (uuid, references team_members, cascade delete)
  - day_of_week (int, 0–6) — day of week this shift lands on
  - day_offset (int, 0-based) — offset from the template's period start
  - shift_start (text, nullable)
  - shift_end (text, nullable)
  - status (text, not null, one of the shift status values)
  - premium_pay_type (text, nullable)
  - premium_pay_amount (numeric, nullable)
  - include_as_non_prod (boolean, default false)
  - shift_override_break (numeric, nullable) — lunch break override in hours
  - borrowed_from_group_id (uuid, nullable) — for borrowed shifts
  - created_at (timestamp)

3. Security
- RLS enabled on both tables.
- Policies scope access to Site owners and admins only (viewer-proof). The
  predicate uses the existing user_can_write_site() helper, which returns true
  only when the caller is an owner or admin of the row's Site. Viewers get no
  rows and cannot write.
- Four policies per table (SELECT / INSERT / UPDATE / DELETE), each TO authenticated.
- GRANT SELECT, INSERT, UPDATE, DELETE on both tables TO authenticated only
  (no anon — app requires sign-in, and viewer role is blocked by predicate).
- The resolve_site_id_for_new_row() trigger is attached to both tables so new
  rows get the correct site_id stamped on insert (derived from the parent
  assignment_groups row), matching the existing pattern on shift_assignments.

4. No data changes
No existing rows are modified or deleted.
*/

CREATE TABLE IF NOT EXISTS public.schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.assignment_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  period_length_days int NOT NULL CHECK (period_length_days > 0),
  start_day_of_week int NOT NULL CHECK (start_day_of_week >= 0 AND start_day_of_week <= 6),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, name)
);

ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "st_select_admin" ON public.schedule_templates;
CREATE POLICY "st_select_admin" ON public.schedule_templates
FOR SELECT TO authenticated
USING (public.user_can_write_site(site_id));

DROP POLICY IF EXISTS "st_insert_admin" ON public.schedule_templates;
CREATE POLICY "st_insert_admin" ON public.schedule_templates
FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));

DROP POLICY IF EXISTS "st_update_admin" ON public.schedule_templates;
CREATE POLICY "st_update_admin" ON public.schedule_templates
FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id))
WITH CHECK (public.user_can_write_site(site_id));

DROP POLICY IF EXISTS "st_delete_admin" ON public.schedule_templates;
CREATE POLICY "st_delete_admin" ON public.schedule_templates
FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_templates TO authenticated;

CREATE TABLE IF NOT EXISTS public.schedule_template_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.schedule_templates(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  day_offset int NOT NULL CHECK (day_offset >= 0),
  shift_start text,
  shift_end text,
  status text NOT NULL,
  premium_pay_type text,
  premium_pay_amount numeric,
  include_as_non_prod boolean NOT NULL DEFAULT false,
  shift_override_break numeric,
  borrowed_from_group_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_template_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "str_select_admin" ON public.schedule_template_rows;
CREATE POLICY "str_select_admin" ON public.schedule_template_rows
FOR SELECT TO authenticated
USING (public.user_can_write_site(site_id));

DROP POLICY IF EXISTS "str_insert_admin" ON public.schedule_template_rows;
CREATE POLICY "str_insert_admin" ON public.schedule_template_rows
FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));

DROP POLICY IF EXISTS "str_update_admin" ON public.schedule_template_rows;
CREATE POLICY "str_update_admin" ON public.schedule_template_rows
FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id))
WITH CHECK (public.user_can_write_site(site_id));

DROP POLICY IF EXISTS "str_delete_admin" ON public.schedule_template_rows;
CREATE POLICY "str_delete_admin" ON public.schedule_template_rows
FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_template_rows TO authenticated;

CREATE INDEX IF NOT EXISTS idx_schedule_templates_group ON public.schedule_templates(group_id);
CREATE INDEX IF NOT EXISTS idx_schedule_template_rows_template ON public.schedule_template_rows(template_id);

-- Stamp site_id on insert for both new tables, deriving from the parent assignment_group.
-- The existing resolve_site_id_for_new_row() handles shift_assignments, team_members, etc.
-- We add a dedicated case for these two tables so site_id is filled before RLS checks run.

CREATE OR REPLACE FUNCTION public.resolve_site_id_for_new_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_site uuid;
  v_group uuid;
BEGIN
  IF new.site_id IS NOT NULL THEN
    RETURN new;
  END IF;

  CASE tg_table_name
    WHEN 'shift_assignments' THEN
      SELECT g.site_id INTO v_site FROM public.assignment_groups g WHERE g.id = new.group_id;
      IF v_site IS NULL THEN
        SELECT m.site_id INTO v_site FROM public.team_members m WHERE m.id = new.member_id;
      END IF;
    WHEN 'schedule_highlights' THEN
      SELECT m.site_id INTO v_site FROM public.team_members m WHERE m.id = new.member_id;
    WHEN 'team_members' THEN
      SELECT g.site_id INTO v_site FROM public.assignment_groups g WHERE g.id = new.group_id;
    WHEN 'volume_plans', 'fte_budgets', 'published_state', 'volume_data_points' THEN
      SELECT g.site_id INTO v_site FROM public.assignment_groups g WHERE g.id = new.group_id;
    WHEN 'schedule_templates' THEN
      SELECT g.site_id INTO v_site FROM public.assignment_groups g WHERE g.id = new.group_id;
    WHEN 'schedule_template_rows' THEN
      SELECT t.site_id INTO v_site FROM public.schedule_templates t WHERE t.id = new.template_id;
      IF v_site IS NULL THEN
        SELECT g.site_id INTO v_site
        FROM public.schedule_templates t
        JOIN public.assignment_groups g ON g.id = t.group_id
        WHERE t.id = new.template_id;
      END IF;
    ELSE
      v_site := NULL;
  END CASE;

  IF v_site IS NULL THEN
    SELECT s.site_id INTO v_site
    FROM public.site_members s
    WHERE s.user_id = auth.uid()
    HAVING count(*) = 1;
  END IF;

  new.site_id := v_site;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.schedule_templates;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.schedule_templates
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.schedule_template_rows;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.schedule_template_rows
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();
