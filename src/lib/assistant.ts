import * as data from "./data";
import type { AssignmentGroup, TeamMember, ShiftAssignment, VolumePlan, CompanyHoliday } from "./types";
import { formatDateISO, dayNames, hoursLabel, shiftDuration } from "./helpers";
import { supabase } from "./supabase";

export interface Proposal {
  title: string;
  detail: string;
  apply: () => Promise<string>;
}

export interface AssistantAnswer {
  text: string;
  proposal?: Proposal;
  suggestions?: string[];
}

export interface ScheduleContext {
  groups: AssignmentGroup[];
  members: TeamMember[];
  assignments: ShiftAssignment[];
  volumePlans: Record<string, VolumePlan>;
  holidays: CompanyHoliday[];
  dates: Date[];
}

export async function loadContext(dates: Date[]): Promise<ScheduleContext> {
  const [groups, members, assignments, holidays] = await Promise.all([
    data.fetchGroups(),
    data.fetchAllMembers(),
    data.fetchAllAssignmentsInRange(dates[0], dates[dates.length - 1]),
    data.fetchCompanyHolidays(),
  ]);
  const volumePlans: Record<string, VolumePlan> = {};
  for (const g of groups) {
    const vp = await data.fetchVolumePlan(g.id);
    if (vp) volumePlans[g.id] = vp;
  }
  return { groups, members, assignments, volumePlans, holidays, dates };
}

function dateLabel(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00");
  return `${dayNames[d.getDay()]} ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

interface EdgeFunctionProposal {
  type: string;
  memberName: string;
  fromDate?: string;
  toDate?: string;
  date?: string;
  shiftStart?: string;
  shiftEnd?: string;
}

function findMemberByName(ctx: ScheduleContext, name: string): TeamMember | null {
  const q = name.toLowerCase().trim();
  for (const m of ctx.members) {
    if (m.name.toLowerCase() === q) return m;
  }
  for (const m of ctx.members) {
    if (m.name.toLowerCase().includes(q) || q.includes(m.name.toLowerCase())) return m;
  }
  const parts = q.split(/\s+/).filter((p) => p.length > 2);
  if (parts.length >= 2) {
    for (const m of ctx.members) {
      if (parts.every((p) => m.name.toLowerCase().includes(p))) return m;
    }
  }
  return null;
}

function buildProposalFromAI(ctx: ScheduleContext, aiProposal: EdgeFunctionProposal): Proposal | undefined {
  const member = findMemberByName(ctx, aiProposal.memberName);
  if (!member) return undefined;

  if (aiProposal.type === "move" && aiProposal.fromDate && aiProposal.toDate) {
    const shift = ctx.assignments.find(
      (a) => a.member_id === member.id && a.assignment_date === aiProposal.fromDate,
    );
    const shiftStart = aiProposal.shiftStart || shift?.shift_start || "06:00";
    const shiftEnd = aiProposal.shiftEnd || shift?.shift_end || "14:00";
    return {
      title: `Move ${member.name}: ${dateLabel(aiProposal.fromDate)} → ${dateLabel(aiProposal.toDate)}`,
      detail: `Move ${member.name} from ${dateLabel(aiProposal.fromDate)} (${shiftStart}–${shiftEnd}) to ${dateLabel(aiProposal.toDate)}. Requires your approval.`,
      apply: async () => {
        await data.deleteShiftAssignment(member.id, aiProposal.fromDate!);
        await data.upsertShiftAssignment({
          member_id: member.id,
          group_id: member.group_id,
          assignment_date: aiProposal.toDate!,
          shift_start: shiftStart,
          shift_end: shiftEnd,
          status: "Scheduled",
          is_published: false,
        });
        await data.logChange(`Moved ${member.name} from ${aiProposal.fromDate} to ${aiProposal.toDate} via AI Assistant`, "Assistant");
        return `Moved ${member.name} to ${dateLabel(aiProposal.toDate!)}.`;
      },
    };
  }

  if (aiProposal.type === "remove" && aiProposal.fromDate && aiProposal.toDate) {
    const shifts = ctx.assignments.filter(
      (a) => a.member_id === member.id &&
        a.assignment_date >= aiProposal.fromDate &&
        a.assignment_date <= aiProposal.toDate &&
        (a.status === "Scheduled" || a.status === "Premium Pay"),
    );
    if (shifts.length === 0) return undefined;
    return {
      title: `Remove ${member.name} from ${dateLabel(aiProposal.fromDate)} – ${dateLabel(aiProposal.toDate)}`,
      detail: `Deletes ${shifts.length} shift${shifts.length === 1 ? "" : "s"} for ${member.name}. Requires your approval.`,
      apply: async () => {
        for (const a of shifts) {
          await data.deleteShiftAssignment(member.id, a.assignment_date);
        }
        await data.logChange(`Removed ${member.name} from ${shifts.length} shift(s) via AI Assistant`, "Assistant");
        return `Removed ${member.name} from ${shifts.length} shift${shifts.length === 1 ? "" : "s"}.`;
      },
    };
  }

  if (aiProposal.type === "addoff" && aiProposal.date) {
    return {
      title: `Mark ${member.name} as Off on ${dateLabel(aiProposal.date)}`,
      detail: `Set ${member.name} to Off status on ${dateLabel(aiProposal.date)}. Requires your approval.`,
      apply: async () => {
        await data.upsertShiftAssignment({
          member_id: member.id,
          group_id: member.group_id,
          assignment_date: aiProposal.date!,
          shift_start: null,
          shift_end: null,
          status: "Off",
          is_published: false,
        });
        await data.logChange(`Marked ${member.name} as Off on ${aiProposal.date} via AI Assistant`, "Assistant");
        return `Marked ${member.name} as Off on ${dateLabel(aiProposal.date!)}.`;
      },
    };
  }

  return undefined;
}

interface EdgeFunctionResponse {
  text: string;
  proposal?: EdgeFunctionProposal | null;
  error?: string;
}

export async function answerQuestion(
  question: string,
  ctx: ScheduleContext,
  conversationHistory?: { role: string; text: string }[],
): Promise<AssistantAnswer> {
  const scheduleData = {
    groups: ctx.groups.map((g) => ({
      id: g.id,
      name: g.name,
      hours_start: g.hours_of_service_start,
      hours_end: g.hours_of_service_end,
    })),
    members: ctx.members.map((m) => ({
      id: m.id,
      name: m.name,
      group_id: m.group_id,
      hourly_rate: m.hourly_rate || 0,
      overtime_threshold: m.overtime_threshold,
      weekly_hours: m.expected_weekly_hours,
    })),
    assignments: ctx.assignments.map((a) => ({
      member_id: a.member_id,
      group_id: a.group_id,
      date: a.assignment_date,
      shift_start: a.shift_start,
      shift_end: a.shift_end,
      status: a.status,
    })),
    volumePlans: ctx.groups.map((g) => {
      const vp = ctx.volumePlans[g.id];
      return {
        group_id: g.id,
        enabled: vp?.enabled || false,
        productivity_rate: vp?.productivity_rate || 0,
        weekend_multiplier: vp?.weekend_multiplier || 0,
        hourly_volume: vp?.hourly_volume || [],
        manual_staff: vp?.manual_staff || [],
      };
    }),
    holidays: ctx.holidays.map((h) => ({ date: h.holiday_date, name: h.name })),
    periodStart: formatDateISO(ctx.dates[0]),
    periodEnd: formatDateISO(ctx.dates[ctx.dates.length - 1]),
  };

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const session = await supabase.auth.getSession();
  if (session.data.session?.access_token) {
    headers["Authorization"] = `Bearer ${session.data.session.access_token}`;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ question, scheduleData, conversationHistory }),
  });

  if (!response.ok) {
    let errMsg = `AI service unavailable (${response.status})`;
    try {
      const errBody = await response.json() as EdgeFunctionResponse;
      if (errBody.error) errMsg = errBody.error;
    } catch { /* use default */ }
    throw new Error(errMsg);
  }

  const result = await response.json() as EdgeFunctionResponse;

  if (result.error) {
    throw new Error(result.error);
  }

  const answer: AssistantAnswer = {
    text: result.text || "I couldn't generate a response. Please try rephrasing your question.",
  };

  if (result.proposal) {
    const proposal = buildProposalFromAI(ctx, result.proposal);
    if (proposal) {
      answer.proposal = proposal;
    }
  }

  return answer;
}
