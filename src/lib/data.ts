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
} from "./types";
import { getCurrentBiweeklyStart, formatDateISO, addDays } from "./helpers";

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

export async function publishSchedule(groupId: string, groupName: string) {
  const biweeklyStart = getCurrentBiweeklyStart();
  const biweeklyEnd = addDays(biweeklyStart, 13);
  const startISO = formatDateISO(biweeklyStart);
  const endISO = formatDateISO(biweeklyEnd);

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

  await logChange(`Published schedule for "${groupName}"`, "Publish");
}

export async function revertToLastPublished(groupId: string, groupName: string) {
  const biweeklyStart = getCurrentBiweeklyStart();
  const biweeklyEnd = addDays(biweeklyStart, 13);
  const startISO = formatDateISO(biweeklyStart);
  const endISO = formatDateISO(biweeklyEnd);

  // Delete all unpublished (draft) assignments in this range
  await supabase
    .from("shift_assignments")
    .delete()
    .eq("group_id", groupId)
    .eq("is_published", false)
    .gte("assignment_date", startISO)
    .lte("assignment_date", endISO);

  await logChange(`Reverted "${groupName}" to last published schedule`, "Revert");
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
