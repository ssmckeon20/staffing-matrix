/*
# Add email to profiles and allow co-members to see each other

1. Summary
The People & Access modal shows every member of a cost center, but currently
every member except yourself appears as "Member" because the profiles SELECT
policy only lets a user read their own profile row. Email addresses are also
not stored in profiles at all (they live in auth.users, which the client cannot
read). This migration:
- Adds an `email` column to `profiles`.
- Updates the auto-create-profile trigger to copy the email from auth.users.
- Backfills `email` for all existing profiles from auth.users.
- Adds a trigger to keep `email` in sync if the auth email ever changes.
- Broadens the profiles SELECT policy so a user can also read profiles of
  anyone who shares a site membership with them.
- Locks down email updates: the new UPDATE policy only allows users to update
  their own first_name, last_name, company_name, and employee_id columns.
  Email is server-managed only.

2. New columns
- `profiles.email` (text, nullable)

3. Modified objects
- `handle_new_user()` trigger function: now also inserts email from auth.users
- New trigger `on_auth_user_email_changed` keeps profiles.email in sync after
  a user's email is updated in auth.users
- `profiles_select_own` policy replaced with `profiles_select_visible`:
  users can read their own profile OR profiles of co-members
- `profiles_update_own` policy tightened to column-restricted UPDATE grant

4. Security
- RLS on profiles remains enabled.
- SELECT: a user can read profiles where auth.uid() = id OR the profile owner
  shares a site membership with the caller.
- UPDATE: only the profile owner can update, and only the non-email columns.
- Email column is excluded from the UPDATE grant so users cannot change it.
- GRANT SELECT on profiles to authenticated (unchanged).
- GRANT UPDATE (first_name, last_name, company_name, employee_id) to authenticated.
- The new trigger function runs as SECURITY DEFINER with fixed search_path.
*/

-- ============ 1. ADD EMAIL COLUMN ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- ============ 2. UPDATE handle_new_user TO COPY EMAIL ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, company_name, employee_id, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'employee_id', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

-- ============ 3. BACKFILL EMAIL FOR EXISTING PROFILES ============
UPDATE public.profiles p
SET email = au.email
FROM auth.users au
WHERE p.id = au.id
  AND (p.email IS NULL OR p.email <> au.email);

-- ============ 4. KEEP EMAIL IN SYNC WHEN AUTH EMAIL CHANGES ============
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email, updated_at = now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- ============ 5. BROADEN SELECT POLICY ============
-- Drop the old own-only SELECT policy and replace with one that also
-- allows reading profiles of co-members (users who share a site).
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_visible" ON public.profiles;

CREATE POLICY "profiles_select_visible"
ON public.profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1
    FROM public.site_members theirs
    JOIN public.site_members mine
      ON mine.site_id = theirs.site_id
    WHERE theirs.user_id = profiles.id
      AND mine.user_id = auth.uid()
  )
);

-- ============ 6. TIGHTEN UPDATE: COLUMN-RESTRICTED, EMAIL EXCLUDED ============
-- Re-grant UPDATE only on the columns the user is allowed to change.
-- Email is managed server-side only.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (first_name, last_name, company_name, employee_id) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
