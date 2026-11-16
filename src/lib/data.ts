import { supabase } from "./supabase";
import type {
  AssignmentGroup,
  TeamMember,
  ShiftAssignment,
  VolumePlan,
  FteBudget,
  ScheduleNote,
  ScheduleHighlight,
  ChangeHistoryEntry,
  PublishedState,
  CompanyHoliday,
  VolumeDataPoint,
  ScheduleTemplate,
  ScheduleTemplateRow,
  ShiftStatus,
  PremiumPayType,
} from "./types";
import { formatDateISO } from "./helpers";

export async function logChange(actionText: string, category: string = "General", userName: string = "Admin") {
  await supabase.from("change_history").insert({
    action_text: actionText,
    user_name: userName,
    category,
  });
}

export async function fetchGroups(): Promise<AssignmentGroup[]> {
  const { data, error } = await supabase
    .from("assignment_groups")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createGroup(name: string, hoursStart: string, hoursEnd: string): Promise<AssignmentGroup> {
  const { data: groups } = await supabase.from("assignment_groups").select("display_order");
  const maxOrder = groups && groups.length > 0 ? Math.max(...groups.map((g: AssignmentGroup) => g.display_order)) : -1;
  const { data, error } = await supabase
    .from("assignment_groups")
    .insert({
      name,
      hours_of_service_start: hoursStart,
      hours_of_service_end: hoursEnd,
      display_order: maxOrder + 1,
    })
    .select()
    .single();
  if (error) throw error;
  const group = data as AssignmentGroup;

  // Create default volume plan (disabled)
  await supabase.from("volume_plans").insert({
    group_id: group.id,
    enabled: false,
    hours_of_service_start: hoursStart,
    hours_of_service_end: hoursEnd,
  });

  // Create published state
  await supabase.from("published_state").insert({ group_id: group.id });

  await logChange(`Created assignment group "${name}"`, "Group");
  return group;
}

export async function updateGroup(id: string, updates: Partial<AssignmentGroup>) {
  const { data, error } = await supabase
    .from("assignment_groups")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as AssignmentGroup;
}

export async function deleteGroup(id: string, name: string) {
  await supabase.from("volume_plans").delete().eq("group_id", id);
  await supabase.from("published_state").delete().eq("group_id", id);
  await supabase.from("fte_budgets").delete().eq("group_id", id);
  await supabase.from("shift_assignments").delete().eq("group_id", id);
  await supabase.from("team_members").delete().eq("group_id", id);
  await supabase.from("assignment_groups").delete().eq("id", id);
  await logChange(`Deleted assignment group "${name}"`, "Group");
}

export async function fetchMembers(groupId?: string): Promise<TeamMember[]> {
  let query = supabase.from("team_members").select("*").order("display_order", { ascending: true });
  if (groupId) query = query.eq("group_id", groupId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchAllMembers(): Promise<TeamMember[]> {
  return fetchMembers();
}

export async function createMember(member: Omit<TeamMember, "id" | "created_at" | "updated_at" | "display_order">): Promise<TeamMember> {
  const { data: members } = await supabase
    .from("team_members")
    .select("display_order")
    .eq("group_id", member.group_id);
  const maxOrder = members && members.length > 0 ? Math.max(...members.map((m: TeamMember) => m.display_order)) : -1;
  const { data, error } = await supabase
    .from("team_members")
    .insert({ ...member, display_order: maxOrder + 1 })
    .select()
    .single();
  if (error) throw error;
  const created = data as TeamMember;
  await logChange(`Added team member "${created.name}"`, "Team");
  return created;
}

export async function updateMember(id: string, updates: Partial<TeamMember>) {
  const { data, error } = await supabase
    .from("team_members")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as TeamMember;
}

export async function deleteMember(id: string, name: string) {
  await supabase.from("shift_assignments").delete().eq("member_id", id);
  await supabase.from("schedule_highlights").delete().eq("member_id", id);
  await supabase.from("team_members").delete().eq("id", id);
  await logChange(`Removed team member "${name}"`, "Team");
}

export async function fetchShiftAssignments(
  groupId: string,
  startDate: Date,
  endDate: Date
): Promise<ShiftAssignment[]> {
  const startISO = formatDateISO(startDate);
  const endISO = formatDateISO(endDate);
  const { data, error } = await supabase
    .from("shift_assignments")
    .select("*")
    .eq("group_id", groupId)
    .gte("assignment_date", startISO)
    .lte("assignment_date", endISO);
  if (error) throw error;
  return data || [];
}

export async function fetchAllAssignmentsInRange(
  startDate: Date,
  endDate: Date
): Promise<ShiftAssignment[]> {
  const startISO = formatDateISO(startDate);
  const endISO = formatDateISO(endDate);
  const { data, error } = await supabase
    .from("shift_assignments")
    .select("*")
    .gte("assignment_date", startISO)
    .lte("assignment_date", endISO);
  if (error) throw error;
  return data || [];
}

export async function fetchPublishedAssignments(
  startDate: Date,
  endDate: Date
): Promise<ShiftAssignment[]> {
  const startISO = formatDateISO(startDate);
  const endISO = formatDateISO(endDate);
  const { data, error } = await supabase
    .from("shift_assignments")
    .select("*")
    .eq("is_published", true)
    .gte("assignment_date", startISO)
    .lte("assignment_date", endISO);
  if (error) throw error;
  return data || [];
}

export async function upsertShiftAssignment(assignment: Partial<ShiftAssignment> & { member_id: string; group_id: string; assignment_date: string }) {
  const existing = await supabase
    .from("shift_assignments")
    .select("*")
    .eq("member_id", assignment.member_id)
    .eq("assignment_date", assignment.assignment_date)
    .maybeSingle();

  if (existing.data) {
    const { data, error } = await supabase
      .from("shift_assignments")
      .update({ ...assignment, updated_at: new Date().toISOString() })
      .eq("id", existing.data.id)
      .select()
      .single();
    if (error) throw error;
    return data as ShiftAssignment;
  } else {
    const { data, error } = await supabase
      .from("shift_assignments")
      .insert(assignment)
      .select()
      .single();
    if (error) throw error;
    return data as ShiftAssignment;
  }
}

export async function deleteAllAssignmentsInRange(groupId: string, startDateISO: string, endDateISO: string) {
  const { error } = await supabase
    .from("shift_assignments")
    .delete()
    .eq("group_id", groupId)
    .gte("assignment_date", startDateISO)
    .lte("assignment_date", endDateISO);
  if (error) throw error;
}

export async function deleteShiftAssignment(memberId: string, date: string) {
  await supabase
    .from("shift_assignments")
    .delete()
    .eq("member_id", memberId)
    .eq("assignment_date", date);
}

export async function fetchShiftForMemberOnDate(memberId: string, date: string): Promise<ShiftAssignment | null> {
  const { data, error } = await supabase
    .from("shift_assignments")
    .select("*")
    .eq("member_id", memberId)
    .eq("assignment_date", date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchVolumePlan(groupId: string): Promise<VolumePlan | null> {
  const { data, error } = await supabase
    .from("volume_plans")
    .select("*")
    .eq("group_id", groupId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateVolumePlan(groupId: string, updates: Partial<VolumePlan>) {
  const { data, error } = await supabase
    .from("volume_plans")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .select()
    .single();
  if (error) throw error;
  return data as VolumePlan;
}

export async function fetchFteBudget(groupId: string): Promise<FteBudget | null> {
  const { data, error } = await supabase
    .from("fte_budgets")
    .select("*")
    .eq("group_id", groupId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertFteBudget(groupId: string, budgetedFte: number) {
  const existing = await supabase.from("fte_budgets").select("*").eq("group_id", groupId).maybeSingle();
  if (existing.data) {
    const { data, error } = await supabase
      .from("fte_budgets")
      .update({ budgeted_fte: budgetedFte, updated_at: new Date().toISOString() })
      .eq("group_id", groupId)
      .select()
      .single();
    if (error) throw error;
    return data as FteBudget;
  } else {
    const { data, error } = await supabase
      .from("fte_budgets")
      .insert({ group_id: groupId, budgeted_fte: budgetedFte })
      .select()
      .single();
    if (error) throw error;
    return data as FteBudget;
  }
}

export async function fetchScheduleNote(): Promise<ScheduleNote | null> {
  const { data, error } = await supabase.from("schedule_notes").select("*").limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertScheduleNote(noteText: string) {
  const existing = await supabase.from("schedule_notes").select("*").limit(1).maybeSingle();
  if (existing.data) {
    const { data, error } = await supabase
      .from("schedule_notes")
      .update({ note_text: noteText, updated_at: new Date().toISOString() })
      .eq("id", existing.data.id)
      .select()
      .single();
    if (error) throw error;
    return data as ScheduleNote;
  } else {
    const { data, error } = await supabase
      .from("schedule_notes")
      .insert({ note_text: noteText })
      .select()
      .single();
    if (error) throw error;
    return data as ScheduleNote;
  }
}

export async function fetchHighlights(): Promise<ScheduleHighlight[]> {
  const { data, error } = await supabase.from("schedule_highlights").select("*");
  if (error) throw error;
  return data || [];
}

export async function toggleHighlight(memberId: string, date: string) {
  const existing = await supabase
    .from("schedule_highlights")
    .select("*")
    .eq("member_id", memberId)
    .eq("highlight_date", date)
    .maybeSingle();
  if (existing.data) {
    await supabase.from("schedule_highlights").delete().eq("id", existing.data.id);
  } else {
    await supabase.from("schedule_highlights").insert({ member_id: memberId, highlight_date: date });
  }
}

export async function fetchChangeHistory(): Promise<ChangeHistoryEntry[]> {
  const { data, error } = await supabase
    .from("change_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function fetchPublishedState(groupId: string): Promise<PublishedState | null> {
  const { data, error } = await supabase
    .from("published_state")
    .select("*")
    .eq("group_id", groupId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function publishSchedule(groupId: string, groupName: string, startDate: Date, endDate: Date) {
  const startISO = formatDateISO(startDate);
  const endISO = formatDateISO(endDate);

  // Mark all draft assignments in this range as published
  await supabase
    .from("shift_assignments")
    .update({ is_published: true, updated_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .eq("is_published", false)
    .gte("assignment_date", startISO)
    .lte("assignment_date", endISO);

  // Update published state
  await supabase
    .from("published_state")
    .update({ last_published_at: new Date().toISOString(), last_published_by: "Admin" })
    .eq("group_id", groupId);

  await logChange(`Posted schedule for "${groupName}"`, "Post");
}

export async function revertToLastPublished(groupId: string, groupName: string, startDate: Date, endDate: Date) {
  const startISO = formatDateISO(startDate);
  const endISO = formatDateISO(endDate);

  // Delete all unpublished (draft) assignments in this range
  await supabase
    .from("shift_assignments")
    .delete()
    .eq("group_id", groupId)
    .eq("is_published", false)
    .gte("assignment_date", startISO)
    .lte("assignment_date", endISO);

  await logChange(`Reverted "${groupName}" to last posted schedule`, "Revert");
}

export async function fetchAllGroupData(groupId: string) {
  const [members, volumePlan, fteBudget, publishedState] = await Promise.all([
    fetchMembers(groupId),
    fetchVolumePlan(groupId),
    fetchFteBudget(groupId),
    fetchPublishedState(groupId),
  ]);
  return { members, volumePlan, fteBudget, publishedState };
}

export async function fetchCompanyHolidays(): Promise<CompanyHoliday[]> {
  const { data, error } = await supabase
    .from("company_holidays")
    .select("*")
    .order("holiday_date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertCompanyHoliday(holidayDate: string, name: string): Promise<CompanyHoliday> {
  const existing = await supabase
    .from("company_holidays")
    .select("*")
    .eq("holiday_date", holidayDate)
    .maybeSingle();
  if (existing.data) {
    const { data, error } = await supabase
      .from("company_holidays")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", existing.data.id)
      .select()
      .single();
    if (error) throw error;
    return data as CompanyHoliday;
  }
  const { data, error } = await supabase
    .from("company_holidays")
    .insert({ holiday_date: holidayDate, name })
    .select()
    .single();
  if (error) throw error;
  return data as CompanyHoliday;
}

export async function deleteCompanyHoliday(holidayDate: string) {
  const { error } = await supabase
    .from("company_holidays")
    .delete()
    .eq("holiday_date", holidayDate);
  if (error) throw error;
}

export async function fetchVolumeDataPoints(groupId: string): Promise<VolumeDataPoint[]> {
  const { data, error } = await supabase
    .from("volume_data_points")
    .select("*")
    .eq("group_id", groupId)
    .order("event_date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function insertVolumeDataPoints(
  points: Omit<VolumeDataPoint, "id" | "created_at">[]
): Promise<number> {
  if (points.length === 0) return 0;
  const CHUNK = 500;
  for (let i = 0; i < points.length; i += CHUNK) {
    const { error } = await supabase.from("volume_data_points").insert(points.slice(i, i + CHUNK));
    if (error) throw error;
  }
  return points.length;
}

export async function countVolumeDataPoints(groupId: string): Promise<number> {
  const { count, error } = await supabase
    .from("volume_data_points")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);
  if (error) throw error;
  return count || 0;
}

export async function deleteAllVolumeDataPoints(groupId: string) {
  const { error } = await supabase
    .from("volume_data_points")
    .delete()
    .eq("group_id", groupId);
  if (error) throw error;
}

// ===== Schedule Templates =====

export async function fetchTemplates(groupId: string): Promise<ScheduleTemplate[]> {
  const { data, error } = await supabase
    .from("schedule_templates")
    .select("*")
    .eq("group_id", groupId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchTemplateRows(templateId: string): Promise<ScheduleTemplateRow[]> {
  const { data, error } = await supabase
    .from("schedule_template_rows")
    .select("*")
    .eq("template_id", templateId);
  if (error) throw error;
  return data || [];
}

export interface TemplateRowInput {
  member_id: string;
  day_of_week: number;
  day_offset: number;
  shift_start: string | null;
  shift_end: string | null;
  status: ShiftStatus;
  premium_pay_type?: PremiumPayType | null;
  premium_pay_amount?: number | null;
  include_as_non_prod?: boolean;
  shift_override_break?: number | null;
  borrowed_from_group_id?: string | null;
}

export async function findTemplateByName(groupId: string, name: string): Promise<ScheduleTemplate | null> {
  const { data, error } = await supabase
    .from("schedule_templates")
    .select("*")
    .eq("group_id", groupId)
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data as ScheduleTemplate | null;
}

export async function createTemplate(
  groupId: string,
  name: string,
  periodLengthDays: number,
  startDayOfWeek: number,
  createdBy: string | null,
  rows: TemplateRowInput[]
): Promise<ScheduleTemplate> {
  const { data, error } = await supabase
    .from("schedule_templates")
    .insert({
      group_id: groupId,
      name,
      period_length_days: periodLengthDays,
      start_day_of_week: startDayOfWeek,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  const template = data as ScheduleTemplate;
  if (rows.length > 0) {
    const payload = rows.map((r) => ({
      template_id: template.id,
      member_id: r.member_id,
      day_of_week: r.day_of_week,
      day_offset: r.day_offset,
      shift_start: r.shift_start,
      shift_end: r.shift_end,
      status: r.status,
      premium_pay_type: r.premium_pay_type ?? null,
      premium_pay_amount: r.premium_pay_amount ?? null,
      include_as_non_prod: r.include_as_non_prod ?? false,
      shift_override_break: r.shift_override_break ?? null,
      borrowed_from_group_id: r.borrowed_from_group_id ?? null,
    }));
    const { error: rowErr } = await supabase.from("schedule_template_rows").insert(payload);
    if (rowErr) throw rowErr;
  }
  return template;
}

export async function replaceTemplateRows(templateId: string, rows: TemplateRowInput[]): Promise<void> {
  const { error: delErr } = await supabase
    .from("schedule_template_rows")
    .delete()
    .eq("template_id", templateId);
  if (delErr) throw delErr;
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({
    template_id: templateId,
    member_id: r.member_id,
    day_of_week: r.day_of_week,
    day_offset: r.day_offset,
    shift_start: r.shift_start,
    shift_end: r.shift_end,
    status: r.status,
    premium_pay_type: r.premium_pay_type ?? null,
    premium_pay_amount: r.premium_pay_amount ?? null,
    include_as_non_prod: r.include_as_non_prod ?? false,
    shift_override_break: r.shift_override_break ?? null,
    borrowed_from_group_id: r.borrowed_from_group_id ?? null,
  }));
  const { error: rowErr } = await supabase.from("schedule_template_rows").insert(payload);
  if (rowErr) throw rowErr;
}

export async function renameTemplate(templateId: string, newName: string): Promise<void> {
  const { error } = await supabase
    .from("schedule_templates")
    .update({ name: newName, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) throw error;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const { error: rowsErr } = await supabase
    .from("schedule_template_rows")
    .delete()
    .eq("template_id", templateId);
  if (rowsErr) throw rowsErr;
  const { error } = await supabase.from("schedule_templates").delete().eq("id", templateId);
  if (error) throw error;
}
