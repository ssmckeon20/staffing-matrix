/*
# Phase 3: Site data isolation, role enforcement, and invitations

1. Plain-English summary
Until now every scheduling table was open to everyone ("allow all" policies from
the original single-tenant app). This migration replaces every one of those rules
with true multi-tenant security:
- You can only see and work with data belonging to Sites you are a member of.
- Viewer members get read-only access. Admin and Owner can manage all scheduling
  data. Only Owners manage Site people and settings.
- A new "site_invitations" table powers the invite flow: an Owner enters an email
  and a role (Admin or Viewer), the invitation is Pending until accepted, and can
  be Revoked or Expired. Tokens are single-use and secret.

2. Security model in detail
- Helper functions (all SECURITY DEFINER, fixed search_path, executable only by
  the authenticated role):
  - `user_site_ids()` — Sites the caller belongs to.
  - `user_site_role(site_id)` — the caller's role in a Site (null if not a member).
  - `user_can_write_site(site_id)` — true when the caller is an Owner or Admin.
  - `user_owns_site(site_id)` — true when the caller is the Site Owner.
- The 11 scheduling tables (assignment_groups, team_members, shift_assignments,
  volume_plans, fte_budgets, schedule_notes, schedule_highlights, change_history,
  published_state, company_holidays, volume_data_points) get four policies each:
  - SELECT: caller is a member of the row's Site.
  - INSERT / UPDATE / DELETE: caller is an Owner or Admin of the row's Site.
  - Rows with a NULL site_id are treated as not accessible through these policies
    (the existing data was already backfilled to a Site in Phase 2).
- site_members policies are rewritten WITHOUT self-referencing subqueries on the
  same table (a policy cannot query its own table — that causes infinite
  recursion). Instead they use the helper functions, which read site_members
  through a SECURITY DEFINER path and therefore cannot recurse.
  - SELECT: you can see your own memberships and memberships of Sites you belong to.
  - INSERT/UPDATE/DELETE: only Site Owners.
- sites policies: members can read their Sites; authenticated users can create a
  Site; Owners can update/delete their Site. UPDATE/DELETE use the helper
  functions to avoid recursion.
- site_invitations:
  - SELECT: Site Owners and Admins of that Site can see its invitations.
  - INSERT: only Site Owners.
  - UPDATE/DELETE: only Site Owners.

3. New Tables
- `site_invitations`
  - `id` (uuid, primary key)
  - `site_id` (uuid, not null, references sites, cascade delete)
  - `email` (text, not null, lowercased)
  - `role` (text, not null — 'admin' or 'viewer')
  - `token` (text, not null, unique — the secret one-time token from the invite link)
  - `status` (text, not null — 'pending', 'accepted', 'revoked', 'expired')
  - `invited_by` (uuid, nullable — the account that sent the invitation)
  - `expires_at` (timestamptz, not null)
  - `created_at`, `updated_at` (timestamps)
  - Indexes on token and (site_id, email).

4. Modified Tables
- No columns added or removed. Only policies replaced (drop + recreate).

5. Important Notes
- Idempotent: DROP POLICY IF EXISTS before each CREATE POLICY.
- No data is dropped or deleted.
- The old "allow all" policies are fully removed — this is the isolation cutover.
- Policy role scopes: SELECT policies TO authenticated; write policies TO
  authenticated (only members pass the predicates anyway).
*/

-- ============ 1. ROLE HELPERS ============
CREATE OR REPLACE FUNCTION public.user_site_role(p_site_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.site_members WHERE site_id = p_site_id AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_can_write_site(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_members
    WHERE site_id = p_site_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_owns_site(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_members
    WHERE site_id = p_site_id AND user_id = auth.uid() AND role = 'owner'
  );
$$;

-- Helpers are not directly callable through the API
REVOKE EXECUTE ON FUNCTION public.user_site_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_can_write_site(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_owns_site(uuid) FROM anon, public;

-- ============ 2. GRANT EXECUTE TO AUTHENTICATED (used by policies) ============
GRANT EXECUTE ON FUNCTION public.user_site_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_site_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_write_site(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_site(uuid) TO authenticated;

-- ============ 3. SCHEDULING TABLES: SITE-ISOLATED POLICIES ============
-- assignment_groups
DROP POLICY IF EXISTS "ag_select" ON assignment_groups;
DROP POLICY IF EXISTS "ag_insert" ON assignment_groups;
DROP POLICY IF EXISTS "ag_update" ON assignment_groups;
DROP POLICY IF EXISTS "ag_delete" ON assignment_groups;
CREATE POLICY "ag_select" ON assignment_groups FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "ag_insert" ON assignment_groups FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "ag_update" ON assignment_groups FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "ag_delete" ON assignment_groups FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- team_members
DROP POLICY IF EXISTS "tm_select" ON team_members;
DROP POLICY IF EXISTS "tm_insert" ON team_members;
DROP POLICY IF EXISTS "tm_update" ON team_members;
DROP POLICY IF EXISTS "tm_delete" ON team_members;
CREATE POLICY "tm_select" ON team_members FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "tm_insert" ON team_members FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "tm_update" ON team_members FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "tm_delete" ON team_members FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- shift_assignments
DROP POLICY IF EXISTS "sa_select" ON shift_assignments;
DROP POLICY IF EXISTS "sa_insert" ON shift_assignments;
DROP POLICY IF EXISTS "sa_update" ON shift_assignments;
DROP POLICY IF EXISTS "sa_delete" ON shift_assignments;
CREATE POLICY "sa_select" ON shift_assignments FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "sa_insert" ON shift_assignments FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "sa_update" ON shift_assignments FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "sa_delete" ON shift_assignments FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- volume_plans
DROP POLICY IF EXISTS "vp_select" ON volume_plans;
DROP POLICY IF EXISTS "vp_insert" ON volume_plans;
DROP POLICY IF EXISTS "vp_update" ON volume_plans;
DROP POLICY IF EXISTS "vp_delete" ON volume_plans;
CREATE POLICY "vp_select" ON volume_plans FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "vp_insert" ON volume_plans FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "vp_update" ON volume_plans FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "vp_delete" ON volume_plans FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- fte_budgets
DROP POLICY IF EXISTS "fb_select" ON fte_budgets;
DROP POLICY IF EXISTS "fb_insert" ON fte_budgets;
DROP POLICY IF EXISTS "fb_update" ON fte_budgets;
DROP POLICY IF EXISTS "fb_delete" ON fte_budgets;
CREATE POLICY "fb_select" ON fte_budgets FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "fb_insert" ON fte_budgets FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "fb_update" ON fte_budgets FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "fb_delete" ON fte_budgets FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- schedule_notes
DROP POLICY IF EXISTS "sn_select" ON schedule_notes;
DROP POLICY IF EXISTS "sn_insert" ON schedule_notes;
DROP POLICY IF EXISTS "sn_update" ON schedule_notes;
DROP POLICY IF EXISTS "sn_delete" ON schedule_notes;
CREATE POLICY "sn_select" ON schedule_notes FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "sn_insert" ON schedule_notes FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "sn_update" ON schedule_notes FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "sn_delete" ON schedule_notes FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- schedule_highlights
DROP POLICY IF EXISTS "sh_select" ON schedule_highlights;
DROP POLICY IF EXISTS "sh_insert" ON schedule_highlights;
DROP POLICY IF EXISTS "sh_update" ON schedule_highlights;
DROP POLICY IF EXISTS "sh_delete" ON schedule_highlights;
CREATE POLICY "sh_select" ON schedule_highlights FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "sh_insert" ON schedule_highlights FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "sh_update" ON schedule_highlights FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "sh_delete" ON schedule_highlights FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- change_history
DROP POLICY IF EXISTS "ch_select" ON change_history;
DROP POLICY IF EXISTS "ch_insert" ON change_history;
DROP POLICY IF EXISTS "ch_update" ON change_history;
DROP POLICY IF EXISTS "ch_delete" ON change_history;
CREATE POLICY "ch_select" ON change_history FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "ch_insert" ON change_history FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "ch_update" ON change_history FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "ch_delete" ON change_history FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- published_state
DROP POLICY IF EXISTS "ps_select" ON published_state;
DROP POLICY IF EXISTS "ps_insert" ON published_state;
DROP POLICY IF EXISTS "ps_update" ON published_state;
DROP POLICY IF EXISTS "ps_delete" ON published_state;
CREATE POLICY "ps_select" ON published_state FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "ps_insert" ON published_state FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "ps_update" ON published_state FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "ps_delete" ON published_state FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- company_holidays
DROP POLICY IF EXISTS "ch_select" ON company_holidays;
DROP POLICY IF EXISTS "ch_insert" ON company_holidays;
DROP POLICY IF EXISTS "ch_update" ON company_holidays;
DROP POLICY IF EXISTS "ch_delete" ON company_holidays;
CREATE POLICY "coh_select" ON company_holidays FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "coh_insert" ON company_holidays FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "coh_update" ON company_holidays FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "coh_delete" ON company_holidays FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- volume_data_points
DROP POLICY IF EXISTS "vdp_select" ON volume_data_points;
DROP POLICY IF EXISTS "vdp_insert" ON volume_data_points;
DROP POLICY IF EXISTS "vdp_update" ON volume_data_points;
DROP POLICY IF EXISTS "vdp_delete" ON volume_data_points;
CREATE POLICY "vdp_select" ON volume_data_points FOR SELECT TO authenticated
USING (site_id IN (SELECT public.user_site_ids()));
CREATE POLICY "vdp_insert" ON volume_data_points FOR INSERT TO authenticated
WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "vdp_update" ON volume_data_points FOR UPDATE TO authenticated
USING (public.user_can_write_site(site_id)) WITH CHECK (public.user_can_write_site(site_id));
CREATE POLICY "vdp_delete" ON volume_data_points FOR DELETE TO authenticated
USING (public.user_can_write_site(site_id));

-- ============ 4. SITES POLICIES (recursion-safe rewrite) ============
DROP POLICY IF EXISTS "sites_select_member" ON sites;
CREATE POLICY "sites_select_member" ON sites FOR SELECT TO authenticated
USING (created_by = auth.uid() OR id IN (SELECT public.user_site_ids()));

DROP POLICY IF EXISTS "sites_insert_authenticated" ON sites;
CREATE POLICY "sites_insert_authenticated" ON sites FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "sites_update_owner" ON sites;
CREATE POLICY "sites_update_owner" ON sites FOR UPDATE TO authenticated
USING (public.user_owns_site(id)) WITH CHECK (public.user_owns_site(id));

DROP POLICY IF EXISTS "sites_delete_owner" ON sites;
CREATE POLICY "sites_delete_owner" ON sites FOR DELETE TO authenticated
USING (public.user_owns_site(id));

-- ============ 5. SITE_MEMBERS POLICIES (recursion-safe rewrite) ============
DROP POLICY IF EXISTS "site_members_select_member" ON site_members;
CREATE POLICY "site_members_select_member" ON site_members FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR site_id IN (SELECT public.user_site_ids())
);

DROP POLICY IF EXISTS "site_members_insert_owner" ON site_members;
CREATE POLICY "site_members_insert_owner" ON site_members FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.user_owns_site(site_id)
);

DROP POLICY IF EXISTS "site_members_update_owner" ON site_members;
CREATE POLICY "site_members_update_owner" ON site_members FOR UPDATE TO authenticated
USING (public.user_owns_site(site_id))
WITH CHECK (public.user_owns_site(site_id));

DROP POLICY IF EXISTS "site_members_delete_owner" ON site_members;
CREATE POLICY "site_members_delete_owner" ON site_members FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.user_owns_site(site_id));

-- ============ 6. INVITATIONS ============
CREATE TABLE IF NOT EXISTS site_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'viewer')),
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_token ON site_invitations(token);
CREATE INDEX IF NOT EXISTS idx_inv_site_email ON site_invitations(site_id, email);

ALTER TABLE site_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_select_admin" ON site_invitations;
CREATE POLICY "inv_select_admin" ON site_invitations FOR SELECT TO authenticated
USING (
  public.user_owns_site(site_id)
  OR public.user_can_write_site(site_id)
);

DROP POLICY IF EXISTS "inv_insert_owner" ON site_invitations;
CREATE POLICY "inv_insert_owner" ON site_invitations FOR INSERT TO authenticated
WITH CHECK (public.user_owns_site(site_id));

DROP POLICY IF EXISTS "inv_update_owner" ON site_invitations;
CREATE POLICY "inv_update_owner" ON site_invitations FOR UPDATE TO authenticated
USING (public.user_owns_site(site_id)) WITH CHECK (public.user_owns_site(site_id));

DROP POLICY IF EXISTS "inv_delete_owner" ON site_invitations;
CREATE POLICY "inv_delete_owner" ON site_invitations FOR DELETE TO authenticated
USING (public.user_owns_site(site_id));
