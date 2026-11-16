/*
# Phase 5a: Claim an existing workspace

1. Plain-English summary
Sign-in was just added, and all previously created schedules live under a single
default department that no account is linked to yet. These two secure functions
let the first person who signs up claim that existing department (and any other
department that has no members), instead of starting from an empty one.

2. New Functions
- `list_claimable_sites()` — returns departments that currently have no members
  (safe to claim). Callable only by signed-in users.
- `claim_site(p_site_id)` — links the caller to a memberless department as its
  Owner. Refuses if the department already has members, so a claim can only
  happen once. Returns the department name on success.

3. Modified Tables
- None. No columns or data changed.
*/

CREATE OR REPLACE FUNCTION public.list_claimable_sites()
RETURNS TABLE (id uuid, name text, cost_center_number text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.cost_center_number
  FROM public.sites s
  WHERE NOT EXISTS (SELECT 1 FROM public.site_members sm WHERE sm.site_id = s.id)
    AND (s.created_by IS NULL OR s.created_by = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.claim_site(p_site_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid;
BEGIN
  caller := auth.uid();
  IF caller IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to claim a workspace.';
  END IF;
  IF EXISTS (SELECT 1 FROM site_members WHERE site_id = p_site_id) THEN
    RAISE EXCEPTION 'This workspace already has an owner.';
  END IF;
  INSERT INTO site_members (site_id, user_id, role)
  VALUES (p_site_id, caller, 'owner');
  RETURN (SELECT name FROM sites WHERE id = p_site_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_claimable_sites() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.claim_site(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.list_claimable_sites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_site(uuid) TO authenticated;
