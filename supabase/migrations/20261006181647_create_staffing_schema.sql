/*
# Staffing Matrix Scheduler - Core Schema

Creates the full data model for a single-tenant staffing scheduler app.
No auth/sign-in — all policies allow anon + authenticated CRUD.

1. New Tables
- `assignment_groups`: Groups/teams within the department (e.g. Pool, ED Transporter).
  Each group has hours of operation, overtime parameters, and its own volume plan settings.
- `team_members`: Individual employees assigned to a group. Tracks name, status, default
  shift, expected weekly hours, daily unpaid break, hourly rate, premium pay settings.
- `shift_assignments`: Per-day shift assignments for each team member within a group.
  Supports draft (unpublished) and published states.
- `volume_plans`: Per-group volume planning data — expected volume per hour, productivity
  rate, weekend multiplier, enabled/disabled toggle.
- `fte_budgets`: Per-group FTE budget for comparison against scheduled FTEs.
- `schedule_notes`: Custom user notes attached to the employee schedule.
- `schedule_highlights`: Track which employee/day cells are highlighted as changed.
- `change_history`: Audit log of all changes made across the app.
- `published_state`: Tracks when schedules were last published per group.

2. Security
- RLS enabled on all tables.
- All policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because this is a single-tenant app with no sign-in — data is intentionally shared.
*/

-- Assignment Groups (teams within teams)
CREATE TABLE IF NOT EXISTS assignment_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  hours_of_service_start text NOT NULL DEFAULT '06:00',
  hours_of_service_end text NOT NULL DEFAULT '22:00',
  overtime_threshold numeric NOT NULL DEFAULT 40,
  overtime_rate_multiplier numeric NOT NULL DEFAULT 1.5,
  base_hourly_rate numeric NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Team Members
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES assignment_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'Productive' CHECK (status IN ('Productive', 'Training', 'Vacation')),
  default_shift_start text NOT NULL DEFAULT '07:00',
  default_shift_end text NOT NULL DEFAULT '15:30',
  expected_weekly_hours numeric NOT NULL DEFAULT 40,
  daily_unpaid_break numeric NOT NULL DEFAULT 0.5,
  hourly_rate numeric NOT NULL DEFAULT 0,
  premium_pay_enabled boolean NOT NULL DEFAULT false,
  premium_rate numeric NOT NULL DEFAULT 0,
  premium_start_date date,
  premium_end_date date,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Shift Assignments (draft + published)
CREATE TABLE IF NOT EXISTS shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES team_members(id) ON DELETE CASCADE,
  group_id uuid REFERENCES assignment_groups(id) ON DELETE CASCADE,
  assignment_date date NOT NULL,
  shift_start text,
  shift_end text,
  status text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Off', 'PTO', 'LOA', 'Vacation')),
  is_published boolean NOT NULL DEFAULT false,
  -- For tracking which group an employee was borrowed into
  borrowed_from_group_id uuid REFERENCES assignment_groups(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Volume Plans (per group)
CREATE TABLE IF NOT EXISTS volume_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid UNIQUE REFERENCES assignment_groups(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  hours_of_service_start text NOT NULL DEFAULT '06:00',
  hours_of_service_end text NOT NULL DEFAULT '22:00',
  productivity_rate numeric NOT NULL DEFAULT 2,
  weekend_multiplier numeric NOT NULL DEFAULT 0.65,
  -- JSON array of 24 hourly volume values
  hourly_volume jsonb NOT NULL DEFAULT '[4,4,4,4,4,4,8,14,18,20,22,24,26,26,22,20,16,12,8,6,6,4,4,4]'::jsonb,
  -- JSON array of 24 manually-set staff counts (used when productivity_rate is 0)
  manual_staff jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- FTE Budgets (per group)
CREATE TABLE IF NOT EXISTS fte_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid UNIQUE REFERENCES assignment_groups(id) ON DELETE CASCADE,
  budgeted_fte numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Schedule Notes (custom user notes for employee schedule)
CREATE TABLE IF NOT EXISTS schedule_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_text text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Schedule Highlights (track highlighted employee/day cells)
CREATE TABLE IF NOT EXISTS schedule_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES team_members(id) ON DELETE CASCADE,
  highlight_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(member_id, highlight_date)
);

-- Change History (audit log)
CREATE TABLE IF NOT EXISTS change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_text text NOT NULL,
  user_name text NOT NULL DEFAULT 'Admin',
  category text NOT NULL DEFAULT 'General',
  created_at timestamptz DEFAULT now()
);

-- Published State (tracks last publish per group)
CREATE TABLE IF NOT EXISTS published_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid UNIQUE REFERENCES assignment_groups(id) ON DELETE CASCADE,
  last_published_at timestamptz,
  last_published_by text DEFAULT 'Admin',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE assignment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE fte_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE published_state ENABLE ROW LEVEL SECURITY;

-- Assignment Groups policies
DROP POLICY IF EXISTS "ag_select" ON assignment_groups;
CREATE POLICY "ag_select" ON assignment_groups FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ag_insert" ON assignment_groups;
CREATE POLICY "ag_insert" ON assignment_groups FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ag_update" ON assignment_groups;
CREATE POLICY "ag_update" ON assignment_groups FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ag_delete" ON assignment_groups;
CREATE POLICY "ag_delete" ON assignment_groups FOR DELETE TO anon, authenticated USING (true);

-- Team Members policies
DROP POLICY IF EXISTS "tm_select" ON team_members;
CREATE POLICY "tm_select" ON team_members FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tm_insert" ON team_members;
CREATE POLICY "tm_insert" ON team_members FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "tm_update" ON team_members;
CREATE POLICY "tm_update" ON team_members FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "tm_delete" ON team_members;
CREATE POLICY "tm_delete" ON team_members FOR DELETE TO anon, authenticated USING (true);

-- Shift Assignments policies
DROP POLICY IF EXISTS "sa_select" ON shift_assignments;
CREATE POLICY "sa_select" ON shift_assignments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "sa_insert" ON shift_assignments;
CREATE POLICY "sa_insert" ON shift_assignments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sa_update" ON shift_assignments;
CREATE POLICY "sa_update" ON shift_assignments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sa_delete" ON shift_assignments;
CREATE POLICY "sa_delete" ON shift_assignments FOR DELETE TO anon, authenticated USING (true);

-- Volume Plans policies
DROP POLICY IF EXISTS "vp_select" ON volume_plans;
CREATE POLICY "vp_select" ON volume_plans FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "vp_insert" ON volume_plans;
CREATE POLICY "vp_insert" ON volume_plans FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "vp_update" ON volume_plans;
CREATE POLICY "vp_update" ON volume_plans FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "vp_delete" ON volume_plans;
CREATE POLICY "vp_delete" ON volume_plans FOR DELETE TO anon, authenticated USING (true);

-- FTE Budgets policies
DROP POLICY IF EXISTS "fb_select" ON fte_budgets;
CREATE POLICY "fb_select" ON fte_budgets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "fb_insert" ON fte_budgets;
CREATE POLICY "fb_insert" ON fte_budgets FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "fb_update" ON fte_budgets;
CREATE POLICY "fb_update" ON fte_budgets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fb_delete" ON fte_budgets;
CREATE POLICY "fb_delete" ON fte_budgets FOR DELETE TO anon, authenticated USING (true);

-- Schedule Notes policies
DROP POLICY IF EXISTS "sn_select" ON schedule_notes;
CREATE POLICY "sn_select" ON schedule_notes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "sn_insert" ON schedule_notes;
CREATE POLICY "sn_insert" ON schedule_notes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sn_update" ON schedule_notes;
CREATE POLICY "sn_update" ON schedule_notes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sn_delete" ON schedule_notes;
CREATE POLICY "sn_delete" ON schedule_notes FOR DELETE TO anon, authenticated USING (true);

-- Schedule Highlights policies
DROP POLICY IF EXISTS "sh_select" ON schedule_highlights;
CREATE POLICY "sh_select" ON schedule_highlights FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "sh_insert" ON schedule_highlights;
CREATE POLICY "sh_insert" ON schedule_highlights FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sh_update" ON schedule_highlights;
CREATE POLICY "sh_update" ON schedule_highlights FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sh_delete" ON schedule_highlights;
CREATE POLICY "sh_delete" ON schedule_highlights FOR DELETE TO anon, authenticated USING (true);

-- Change History policies
DROP POLICY IF EXISTS "ch_select" ON change_history;
CREATE POLICY "ch_select" ON change_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ch_insert" ON change_history;
CREATE POLICY "ch_insert" ON change_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ch_update" ON change_history;
CREATE POLICY "ch_update" ON change_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ch_delete" ON change_history;
CREATE POLICY "ch_delete" ON change_history FOR DELETE TO anon, authenticated USING (true);

-- Published State policies
DROP POLICY IF EXISTS "ps_select" ON published_state;
CREATE POLICY "ps_select" ON published_state FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ps_insert" ON published_state;
CREATE POLICY "ps_insert" ON published_state FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ps_update" ON published_state;
CREATE POLICY "ps_update" ON published_state FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ps_delete" ON published_state;
CREATE POLICY "ps_delete" ON published_state FOR DELETE TO anon, authenticated USING (true);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_team_members_group ON team_members(group_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_member ON shift_assignments(member_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_group ON shift_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_date ON shift_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_change_history_created ON change_history(created_at DESC);
