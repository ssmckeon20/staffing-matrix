/*
# Phase 4: Audit logging and invite acceptance

1. Plain-English summary
This migration adds two things:
- An audit trail ("audit_log" table): every insert, update, or delete made to the
  scheduling tables (and to Site membership and invitations) is automatically
  recorded with who did it, when, what changed, and which Site it belongs to.
  Managers can view the audit trail for their Sites from the app.
- A safe way to accept an invitation: when someone opens an invite link, the app
  calls a secure database function that checks the token, marks the invitation
  accepted, and adds the person to the Site with the invited role. Nobody can
  forge this by editing rows directly.

2. New Tables
- `audit_log`
  - `id` (uuid, primary key)
  - `occurred_at` (timestamptz, when the change happened)
  - `user_id` (uuid, nullable — account that made the change)
  - `user_email` (text, nullable — their email at the time)
  - `action` (text — 'insert', 'update', or 'delete')
  - `table_name` (text — which table was changed)
  - `record_id` (text — id of the changed row)
  - `site_id` (uuid, nullable — Site the row belongs to, when known)
  - `payload` (jsonb — snapshot of the row after insert/update, before delete)
  - Index on occurred_at and site_id.

3. Modified Tables
- No columns added or removed on existing tables. Only new triggers are attached.

4. New Functions
- `audit_trigger_fn()` — SECURITY DEFINER trigger function. Reads the changed
  row, resolves its Site (via site_id, falling back to the table's own id for
  sites), resolves the caller's email, and writes one audit_log row. Because it
  is SECURITY DEFINER with a fixed search_path, it always succeeds regardless of
  row-level security on audit_log.
- `accept_site_invitation(p_token text)` — SECURITY DEFINER function, callable
  only by signed-in users. Validates that the token exists, is pending, and not
  expired; adds the caller as a Site member with the invited role; marks the
  invitation accepted. Returns the Site name on success; raises a clear error
  otherwise. Each invitation can only be claimed once.

5. Security
- RLS enabled on audit_log.
- SELECT: signed-in users can read audit rows for Sites they belong to.
- INSERT: none through the API — rows are only created by the trigger.
- UPDATE / DELETE: none — the audit trail is append-only.
- Triggers (AFTER INSERT/UPDATE/DELETE) attached to: assignment_groups,
  team_members, shift_assignments, volume_plans, fte_budgets, schedule_notes,
  schedule_highlights, change_history, published_state, company_holidays,
  volume_data_points, site_members, site_invitations.

6. Important Notes
- Idempotent: functions use CREATE OR REPLACE; triggers are dropped before being
  recreated; audit_log uses IF NOT EXISTS.
- No data is dropped or deleted.
- The audit trigger is generic and derives the site from the row itself, so the
  app does not need to pass any extra information when writing.
*/

-- ============ 1. AUDIT LOG TABLE ============
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_email text,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  table_name text NOT NULL,
  record_id text,
  site_id uuid,
  payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_site ON audit_log(site_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_read_member" ON audit_log;
CREATE POLICY "audit_read_member" ON audit_log FOR SELECT
TO authenticated
USING (site_id IS NULL OR site_id IN (SELECT public.user_site_ids()));

-- ============ 2. GENERIC AUDIT TRIGGER FUNCTION ============
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec jsonb;
  rid text;
  sid uuid;
  uid uuid;
  uemail text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec := to_jsonb(OLD);
  ELSE
    rec := to_jsonb(NEW);
  END IF;

  rid := rec->>'id';

  IF TG_TABLE_NAME = 'sites' THEN
    sid := rec->>'id';
  ELSE
    sid := rec->>'site_id';
  END IF;

  BEGIN
    uid := auth.uid();
    uemail := (SELECT email::text FROM auth.users WHERE id = uid);
  EXCEPTION WHEN OTHERS THEN
    uid := NULL;
    uemail := NULL;
  END;

  INSERT INTO public.audit_log (user_id, user_email, action, table_name, record_id, site_id, payload)
  VALUES (uid, uemail, lower(TG_OP), TG_TABLE_NAME, rid, sid, rec);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============ 3. ATTACH TRIGGERS TO ALL TRACKED TABLES ============
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'assignment_groups', 'team_members', 'shift_assignments',
    'volume_plans', 'fte_budgets', 'schedule_notes', 'schedule_highlights',
    'change_history', 'published_state', 'company_holidays', 'volume_data_points',
    'site_members', 'site_invitations'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()', t, t
    );
  END LOOP;
END;
$$;

-- ============ 4. ACCEPT INVITATION RPC ============
CREATE OR REPLACE FUNCTION public.accept_site_invitation(p_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv record;
  caller uuid;
  already boolean;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to accept an invitation.';
  END IF;

  SELECT * INTO inv FROM site_invitations WHERE token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invitation link is not valid.';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'This invitation is no longer active.';
  END IF;
  IF inv.expires_at < now() THEN
    UPDATE site_invitations SET status = 'expired', updated_at = now() WHERE id = inv.id;
    RAISE EXCEPTION 'This invitation has expired.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM site_members WHERE site_id = inv.site_id AND user_id = caller
  ) INTO already;
  IF already THEN
    UPDATE site_invitations SET status = 'accepted', updated_at = now() WHERE id = inv.id;
    RETURN (SELECT name FROM sites WHERE id = inv.site_id);
  END IF;

  INSERT INTO site_members (site_id, user_id, role)
  VALUES (inv.site_id, caller, inv.role);

  UPDATE site_invitations SET status = 'accepted', updated_at = now() WHERE id = inv.id;

  RETURN (SELECT name FROM sites WHERE id = inv.site_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_site_invitation(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.accept_site_invitation(text) TO authenticated;
