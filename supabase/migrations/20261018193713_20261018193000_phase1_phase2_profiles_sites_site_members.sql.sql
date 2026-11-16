/*
# Phase 1 + 2: User identity and Site (tenant) layer

1. Plain-English summary
ShiftLine today is a single shared workspace with no sign-in. This migration adds
the two foundation pieces for multi-tenant operation:
- Identity: a "profiles" table holding each user's name, optional company name and
  optional employee ID. It is automatically kept in sync with Supabase's built-in
  authentication (email + password accounts).
- Tenancy: a "sites" table (each Site = one cost center / department / team) and a
  "site_members" table linking accounts to Sites with a role of Owner, Admin, or
  Viewer. A user can belong to many Sites.
Every existing scheduling table gets a "site_id" column, and all current rows are
attached to a single default Site created from the existing data, so nothing is
lost and the app keeps working.

2. New Tables
- `profiles`
  - `id` (uuid, primary key, matches the auth account id)
  - `first_name` (text, not null)
  - `last_name` (text, not null)
  - `company_name` (text, nullable — optional)
  - `employee_id` (text, nullable — optional)
  - `created_at`, `updated_at` (timestamps)
- `sites`
  - `id` (uuid, primary key)
  - `name` (text, not null — e.g. "Patient Transport")
  - `cost_center_number` (text, not null)
  - `created_by` (uuid, nullable — account that created the Site)
  - `created_at`, `updated_at` (timestamps)
- `site_members`
  - `id` (uuid, primary key)
  - `site_id` (uuid, not null, references sites, cascade delete)
  - `user_id` (uuid, not null, references profiles, cascade delete)
  - `role` (text, not null — 'owner', 'admin', or 'viewer')
  - `created_at` (timestamp)
  - UNIQUE(site_id, user_id)

3. Modified Tables (site_id column added to all)
- `assignment_groups`, `team_members`, `shift_assignments`, `volume_plans`,
  `fte_budgets`, `schedule_notes`, `schedule_highlights`, `change_history`,
  `published_state`, `company_holidays`, `volume_data_points`
  - each gets `site_id uuid` (nullable for now, so existing rows keep working)
  - each gets an index on site_id for site-scoped queries

4. Automatic profile creation
- A database trigger creates a `profiles` row automatically whenever a new auth
  account is registered, so no user record is ever missing.

5. Backfill (one default Site for existing data)
- Creates a Site named from the first assignment group (or "Default Site") with
  cost center number "0000".
- Sets every existing row's site_id to that Site.

6. Security
- RLS enabled on profiles, sites, site_members.
- profiles: users can read and update only their own profile; inserts happen via
  the signup trigger (SECURITY DEFINER, fixed search_path).
- sites: members can read Sites they belong to; any authenticated user can create
  a Site (they become its Owner via membership, written by app logic).
- site_members: members can see who belongs to their Sites; Site Owners manage
  membership changes (invite/change role/remove); users can insert their own
  membership (used when claiming ownership of a Site they just created).
- Helper function `user_site_ids()` returns the set of Site ids the caller is a
  member of (SECURITY DEFINER, fixed search_path) so Phase 3 policies can use it.
- `handle_new_user()` trigger function has a fixed search_path for safety.
- No existing policies are removed yet — data isolation policies are Phase 3.

7. Important Notes
- Idempotent: all statements use IF NOT EXISTS / DROP-if-exists guards.
- Table creation order guarantees referenced tables exist before policies use them.
- No data is dropped or deleted; existing rows are preserved and assigned to the
  default Site.
- Existing open policies on the 11 scheduling tables remain in effect for now.
*/

-- ============ 1. PROFILES ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  company_name text,
  employee_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
TO authenticated WITH CHECK (auth.uid() = id);

-- ============ 2. SITES ============
CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cost_center_number text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

-- ============ 3. SITE MEMBERS ============
CREATE TABLE IF NOT EXISTS site_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, user_id)
);

ALTER TABLE site_members ENABLE ROW LEVEL SECURITY;

-- Now that site_members exists, add the sites policies
DROP POLICY IF EXISTS "sites_select_member" ON sites;
CREATE POLICY "sites_select_member" ON sites FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM site_members sm
    WHERE sm.site_id = sites.id AND sm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "sites_insert_authenticated" ON sites;
CREATE POLICY "sites_insert_authenticated" ON sites FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "site_members_select_member" ON site_members;
CREATE POLICY "site_members_select_member" ON site_members FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM site_members my
    WHERE my.site_id = site_members.site_id AND my.user_id = auth.uid()
  )
);

-- Site Owners manage memberships (invite/change role/remove);
-- users can add their own membership (claiming ownership of a Site they created)
DROP POLICY IF EXISTS "site_members_insert_owner" ON site_members;
CREATE POLICY "site_members_insert_owner" ON site_members FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM site_members my
    WHERE my.site_id = site_members.site_id
      AND my.user_id = auth.uid()
      AND my.role = 'owner'
  )
);

DROP POLICY IF EXISTS "site_members_update_owner" ON site_members;
CREATE POLICY "site_members_update_owner" ON site_members FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM site_members my
    WHERE my.site_id = site_members.site_id
      AND my.user_id = auth.uid()
      AND my.role = 'owner'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM site_members my
    WHERE my.site_id = site_members.site_id
      AND my.user_id = auth.uid()
      AND my.role = 'owner'
  )
);

DROP POLICY IF EXISTS "site_members_delete_owner" ON site_members;
CREATE POLICY "site_members_delete_owner" ON site_members FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM site_members my
    WHERE my.site_id = site_members.site_id
      AND my.user_id = auth.uid()
      AND my.role = 'owner'
  )
);

-- ============ 4. AUTO-CREATE PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, company_name, employee_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'employee_id', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ 5. SITE_ID COLUMNS ON ALL SCHEDULING TABLES ============
ALTER TABLE assignment_groups   ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE team_members        ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE shift_assignments   ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE volume_plans        ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE fte_budgets         ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE schedule_notes      ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE schedule_highlights ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE change_history      ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE published_state     ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE company_holidays    ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE volume_data_points  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ag_site   ON assignment_groups(site_id);
CREATE INDEX IF NOT EXISTS idx_tm_site   ON team_members(site_id);
CREATE INDEX IF NOT EXISTS idx_sa_site   ON shift_assignments(site_id);
CREATE INDEX IF NOT EXISTS idx_vp_site   ON volume_plans(site_id);
CREATE INDEX IF NOT EXISTS idx_fb_site   ON fte_budgets(site_id);
CREATE INDEX IF NOT EXISTS idx_sn_site   ON schedule_notes(site_id);
CREATE INDEX IF NOT EXISTS idx_sh_site   ON schedule_highlights(site_id);
CREATE INDEX IF NOT EXISTS idx_ch_site   ON change_history(site_id);
CREATE INDEX IF NOT EXISTS idx_ps_site   ON published_state(site_id);
CREATE INDEX IF NOT EXISTS idx_coh_site  ON company_holidays(site_id);
CREATE INDEX IF NOT EXISTS idx_vdp_site  ON volume_data_points(site_id);

-- ============ 6. HELPER: SITES THE CALLER BELONGS TO ============
CREATE OR REPLACE FUNCTION public.user_site_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT site_id FROM public.site_members WHERE user_id = auth.uid();
$$;

-- ============ 7. BACKFILL: ONE DEFAULT SITE FOR EXISTING DATA ============
DO $$
DECLARE
  default_site_id uuid;
  first_group_name text;
BEGIN
  SELECT id INTO default_site_id FROM public.sites ORDER BY created_at LIMIT 1;
  IF default_site_id IS NULL THEN
    SELECT name INTO first_group_name FROM public.assignment_groups ORDER BY display_order, created_at LIMIT 1;
    INSERT INTO public.sites (name, cost_center_number)
    VALUES (COALESCE(NULLIF(first_group_name, ''), 'Default Site'), '0000')
    RETURNING id INTO default_site_id;

    UPDATE public.assignment_groups   SET site_id = default_site_id WHERE site_id IS NULL;
    UPDATE public.team_members        SET site_id = default_site_id WHERE site_id IS NULL;
    UPDATE public.shift_assignments   SET site_id = default_site_id WHERE site_id IS NULL;
    UPDATE public.volume_plans        SET site_id = default_site_id WHERE site_id IS NULL;
    UPDATE public.fte_budgets         SET site_id = default_site_id WHERE site_id IS NULL;
    UPDATE public.schedule_notes      SET site_id = default_site_id WHERE site_id IS NULL;
    UPDATE public.schedule_highlights SET site_id = default_site_id WHERE site_id IS NULL;
    UPDATE public.change_history      SET site_id = default_site_id WHERE site_id IS NULL;
    UPDATE public.published_state     SET site_id = default_site_id WHERE site_id IS NULL;
    UPDATE public.company_holidays    SET site_id = default_site_id WHERE site_id IS NULL;
    UPDATE public.volume_data_points  SET site_id = default_site_id WHERE site_id IS NULL;
  END IF;
END;
$$;
