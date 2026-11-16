/*
# Auto-fill site_id on new rows

1. Problem
  - Saving a shift in the Scheduling Grid failed with
    "new row violates row-level security policy for table 'shift_assignments'".
  - Root cause: the grid inserts rows WITHOUT a site_id. The site_id column has no
    default and no trigger to fill it, so the new row is stored with NULL.
  - The INSERT security policy checks user_can_write_site(site_id); with a NULL
    site_id this check can never pass, so every insert was rejected.
  - The same gap affects every table that carries a site_id but is inserted from
    the app without one: schedule_highlights, schedule_notes, company_holidays,
    change_history, volume_plans, fte_budgets, published_state, volume_data_points,
    team_members, assignment_groups.

2. Solution
  - Add a helper function that resolves the correct site for a new row:
      1. If the row already has a site_id, keep it.
      2. Otherwise derive it from the row's parent (the assignment group or team
         member it belongs to).
      3. Otherwise fall back to the signed-in user's site, but only when the user
         belongs to exactly one site (so nothing is guessed for multi-site users).
  - Attach a BEFORE INSERT trigger using this helper to every site-scoped table.
  - Security is unchanged: the site is stamped BEFORE the permission policies run,
    so the INSERT / UPDATE / DELETE policies still verify the caller can write to
    that exact site. A user cannot gain access to another site's data by inserting
    a row, because the stamped value is what gets checked.

3. Tables modified (trigger added, no column or data changes)
  - shift_assignments, schedule_highlights, team_members, assignment_groups,
    volume_plans, fte_budgets, published_state, volume_data_points,
    schedule_notes, change_history, company_holidays.

4. Security
  - Helper is SECURITY DEFINER with a locked search_path (same pattern as the
    existing user_can_write_site / user_site_ids helpers) so it can read parent
    rows the caller cannot select directly.
  - No policy is weakened; NULL site_id rows remain inaccessible, but valid
    inserts now get stamped and pass the check instead of failing.
*/

CREATE OR REPLACE FUNCTION public.resolve_site_id_for_new_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_site uuid;
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

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.shift_assignments;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.shift_assignments
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.schedule_highlights;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.schedule_highlights
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.team_members;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.assignment_groups;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.assignment_groups
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.volume_plans;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.volume_plans
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.fte_budgets;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.fte_budgets
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.published_state;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.published_state
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.volume_data_points;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.volume_data_points
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.schedule_notes;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.schedule_notes
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.change_history;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.change_history
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();

DROP TRIGGER IF EXISTS stamp_site_id_on_insert ON public.company_holidays;
CREATE TRIGGER stamp_site_id_on_insert BEFORE INSERT ON public.company_holidays
FOR EACH ROW EXECUTE FUNCTION public.resolve_site_id_for_new_row();
