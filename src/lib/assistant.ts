import * as data from "./data";
import type { AssignmentGroup, TeamMember, ShiftAssignment, VolumePlan, CompanyHoliday } from "./types";
import { formatDateISO, addDays, dayNames, hoursLabel, shiftDuration } from "./helpers";

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

// ---- Shared computations ----

function spanningHours(start: string | null, end: string | null): number[] {
  if (!start || !end) return [];
  const s = parseInt(start.split(":")[0]);
  const e = parseInt(end.split(":")[0]);
  const hours: number[] = [];
  if (e <= s) {
    for (let h = s; h < 24; h++) hours.push(h);
    for (let h = 0; h < e; h++) hours.push(h);
  } else {
    for (let h = s; h < e; h++) hours.push(h);
  }
  return hours;
}

function neededForGroup(vp: VolumePlan | undefined, hour: number, isWeekend: boolean): number {
  if (!vp || !vp.enabled) return 1;
  if (vp.productivity_rate > 0) {
    const vol = (Array.isArray(vp.hourly_volume) ? vp.hourly_volume : [])[hour] || 0;
    const eff = isWeekend ? vol * vp.weekend_multiplier : vol;
    return Math.ceil(eff / vp.productivity_rate);
  }
  return (Array.isArray(vp.manual_staff) ? vp.manual_staff[hour] : 0) || 1;
}

function scheduledAt(ctx: ScheduleContext, dateISO: string, hour: number, groupId: string): number {
  return ctx.assignments.filter((a) =>
    a.group_id === groupId &&
    a.assignment_date === dateISO &&
    (a.status === "Scheduled" || a.status === "Premium Pay") &&
    spanningHours(a.shift_start, a.shift_end).includes(hour)
  ).length;
}

function findMember(ctx: ScheduleContext, question: string): TeamMember | null {
  const q = question.toLowerCase();
  let best: TeamMember | null = null;
  let bestLen = 0;
  for (const m of ctx.members) {
    const full = m.name.toLowerCase();
    if (q.includes(full) && full.length > bestLen) { best = m; bestLen = full.length; continue; }
    const parts = full.split(/\s+/).filter((p) => p.length > 2);
    if (parts.length >= 2 && parts.every((p) => q.includes(p)) && full.length > bestLen) {
      best = m; bestLen = full.length;
    }
  }
  return best;
}

function memberShiftDates(ctx: ScheduleContext, memberId: string): ShiftAssignment[] {
  return ctx.assignments
    .filter((a) => a.member_id === memberId && (a.status === "Scheduled" || a.status === "Premium Pay") && a.shift_start && a.shift_end)
    .sort((a, b) => a.assignment_date.localeCompare(b.assignment_date));
}

function dateLabel(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00");
  return `${dayNames[d.getDay()]} ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function parseDayReference(question: string, dates: Date[]): Date | null {
  const q = question.toLowerCase();
  if (q.includes("today")) {
    const todayISO = formatDateISO(new Date());
    return dates.find((d) => formatDateISO(d) === todayISO) || null;
  }
  if (q.includes("tomorrow")) {
    const tmrISO = formatDateISO(addDays(new Date(), 1));
    return dates.find((d) => formatDateISO(d) === tmrISO) || null;
  }
  for (let i = 0; i < dayNames.length; i++) {
    const names = [dayNames[i].toLowerCase(), dayNames[i].toLowerCase().slice(0, 3)];
    if (names.some((n) => new RegExp(`\\b${n}\\b`).test(q))) {
      return dates.find((d) => d.getDay() === i) || null;
    }
  }
  const m = q.match(/(\d{1,2})\/(\d{1,2})/);
  if (m) {
    const target = formatDateISO(new Date(new Date().getFullYear(), +m[1] - 1, +m[2]));
    return dates.find((d) => formatDateISO(d) === target) || null;
  }
  return null;
}

// ---- Intent handlers ----

function answerRemovalImpact(ctx: ScheduleContext, member: TeamMember): AssistantAnswer {
  const shifts = memberShiftDates(ctx, member.id);
  if (shifts.length === 0) {
    return { text: `${member.name} has no shifts scheduled in the current period, so removing them would have no coverage impact.` };
  }
  const group = ctx.groups.find((g) => g.id === member.group_id);
  const vp = ctx.volumePlans[member.group_id];
  const affectedLines: string[] = [];
  let totalHours = 0;
  let gapCount = 0;
  for (const a of shifts) {
    const hrs = Math.max(0, shiftDuration(a.shift_start!, a.shift_end!) - member.daily_unpaid_break);
    totalHours += hrs;
    const d = new Date(a.assignment_date + "T00:00:00");
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const gapHours: number[] = [];
    for (const hour of spanningHours(a.shift_start, a.shift_end)) {
      const needed = neededForGroup(vp, hour, isWeekend);
      const afterRemoval = scheduledAt(ctx, a.assignment_date, hour, member.group_id) - 1;
      if (afterRemoval < needed) { gapHours.push(hour); gapCount++; }
    }
    const gapText = gapHours.length > 0
      ? ` creates gaps at ${gapHours.map((h) => `${h}:00`).join(", ")}`
      : " with coverage still sufficient";
    affectedLines.push(`• ${dateLabel(a.assignment_date)} ${a.shift_start}–${a.shift_end} (${hoursLabel(hrs)})${gapText}`);
  }

  const summary = `If you remove ${member.name} from this period (${group?.name || "their group"}):\n\n${affectedLines.join("\n")}\n\nTotal: ${hoursLabel(totalHours)} of scheduled time removed, ${gapCount} hour${gapCount === 1 ? "" : "s"} falling below target coverage.`;

  return {
    text: summary,
    proposal: {
      title: `Remove ${member.name} from this period's schedule`,
      detail: `Deletes ${shifts.length} shift${shifts.length === 1 ? "" : "s"} (${hoursLabel(totalHours)}) between ${formatDateISO(ctx.dates[0])} and ${formatDateISO(ctx.dates[ctx.dates.length - 1])}. Requires your approval.`,
      apply: async () => {
        for (const a of shifts) {
          await data.deleteShiftAssignment(member.id, a.assignment_date);
        }
        await data.logChange(`Removed ${member.name} from ${shifts.length} shift(s) via AI Assistant`, "Assistant");
        return `Removed ${member.name} from ${shifts.length} shift${shifts.length === 1 ? "" : "s"}.`;
      },
    },
  };
}

function answerGaps(ctx: ScheduleContext): AssistantAnswer {
  const gaps: { dateISO: string; hour: number; groupName: string; needed: number; scheduled: number }[] = [];
  for (const group of ctx.groups) {
    const vp = ctx.volumePlans[group.id];
    const membersInGroup = ctx.members.filter((m) => m.group_id === group.id);
    if (membersInGroup.length === 0) continue;
    const startH = parseInt((vp?.enabled ? vp.hours_of_service_start : group.hours_of_service_start).split(":")[0]);
    const endH = parseInt((vp?.enabled ? vp.hours_of_service_end : group.hours_of_service_end).split(":")[0]);
    for (const date of ctx.dates) {
      const dateISO = formatDateISO(date);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      for (let h = startH; h <= endH; h++) {
        const needed = neededForGroup(vp, h, isWeekend);
        const scheduled = scheduledAt(ctx, dateISO, h, group.id);
        if (scheduled < needed) {
          gaps.push({ dateISO, hour: h, groupName: group.name, needed, scheduled });
        }
      }
    }
  }
  if (gaps.length === 0) {
    return { text: "Good news — no coverage gaps found in the current period. Every hour meets its target staffing." };
  }
  gaps.sort((a, b) => (b.needed - b.scheduled) - (a.needed - a.scheduled));
  const top = gaps.slice(0, 8);
  const lines = top.map((g) =>
    `• ${dateLabel(g.dateISO)} at ${g.hour}:00 — ${g.groupName}: ${g.scheduled} of ${g.needed} scheduled (short ${g.needed - g.scheduled})`
  );
  const totalShort = gaps.reduce((sum, g) => sum + (g.needed - g.scheduled), 0);
  return {
    text: `I found ${gaps.length} understaffed hour${gaps.length === 1 ? "" : "s"} in the current period (${totalShort} missing staff-hours total). Biggest gaps:\n\n${lines.join("\n")}`,
    suggestions: ["What shift do we most need coverage for?", "Who is working tomorrow?"],
  };
}

function answerCoverageNeed(ctx: ScheduleContext): AssistantAnswer {
  const deficitByHour: Record<number, number> = {};
  const groupByHour: Record<number, string> = {};
  for (const group of ctx.groups) {
    const vp = ctx.volumePlans[group.id];
    const startH = parseInt((vp?.enabled ? vp.hours_of_service_start : group.hours_of_service_start).split(":")[0]);
    const endH = parseInt((vp?.enabled ? vp.hours_of_service_end : group.hours_of_service_end).split(":")[0]);
    for (const date of ctx.dates) {
      const dateISO = formatDateISO(date);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      for (let h = startH; h <= endH; h++) {
        const needed = neededForGroup(vp, h, isWeekend);
        const scheduled = scheduledAt(ctx, dateISO, h, group.id);
        if (scheduled < needed) {
          deficitByHour[h] = (deficitByHour[h] || 0) + (needed - scheduled);
          if (!groupByHour[h]) groupByHour[h] = group.name;
        }
      }
    }
  }
  const hours = Object.keys(deficitByHour).map(Number).sort((a, b) => deficitByHour[b] - deficitByHour[a]);
  if (hours.length === 0) {
    return { text: "No recurring coverage shortfalls right now, so a new hire could be most flexible — but there is no single shift where demand is unmet." };
  }
  const best = hours[0];
  const otherHours = hours.slice(1, 3);
  const totalDeficit = hours.reduce((s, h) => s + deficitByHour[h], 0);
  return {
    text: `Based on the current period, the greatest unmet coverage is at ${best}:00 (${deficitByHour[best]} missing staff-hours, mostly in ${groupByHour[best]}).${otherHours.length ? ` Next needs: ${otherHours.map((h) => `${h}:00 (${deficitByHour[h]})`).join(", ")}.` : ""}\n\nA new transporter on a shift starting around ${best - 1}:00 or ${best}:00 would close the largest gap. Total unmet demand this period: ${totalDeficit} staff-hours.`,
  };
}

function answerHolidayWorkers(ctx: ScheduleContext): AssistantAnswer {
  const todayISO = formatDateISO(new Date());
  const past = ctx.holidays.filter((h) => h.holiday_date <= todayISO).sort((a, b) => b.holiday_date.localeCompare(a.holiday_date));
  const holiday = past[0] || ctx.holidays.slice().sort((a, b) => b.holiday_date.localeCompare(a.holiday_date))[0];
  if (!holiday) {
    return { text: "No company holidays have been defined yet. You can define them on the Team tab under Company Holidays." };
  }
  const working = ctx.assignments.filter((a) =>
    a.assignment_date === holiday.holiday_date &&
    (a.status === "Scheduled" || a.status === "Premium Pay")
  );
  if (working.length === 0) {
    return { text: `Nobody is scheduled to work on ${holiday.name} (${dateLabel(holiday.holiday_date)}).` };
  }
  const byMember = new Map<string, string[]>();
  for (const a of working) {
    const m = ctx.members.find((x) => x.id === a.member_id);
    if (!m) continue;
    const list = byMember.get(m.name) || [];
    list.push(`${a.shift_start}–${a.shift_end}`);
    byMember.set(m.name, list);
  }
  const lines = Array.from(byMember.entries()).map(([name, times]) => `• ${name} — ${times.join(", ")}`);
  return { text: `On ${holiday.name} (${dateLabel(holiday.holiday_date)}), ${byMember.size} employee${byMember.size === 1 ? " was" : "s were"} scheduled to work:\n\n${lines.join("\n")}` };
}

function answerWhoWorking(ctx: ScheduleContext, question: string): AssistantAnswer {
  const date = parseDayReference(question, ctx.dates);
  if (!date) {
    return { text: "Which day do you mean? You can ask about a weekday (e.g. \"who is working Monday?\"), today, or tomorrow." };
  }
  const dateISO = formatDateISO(date);
  const working = ctx.assignments.filter((a) =>
    a.assignment_date === dateISO && (a.status === "Scheduled" || a.status === "Premium Pay")
  );
  if (working.length === 0) {
    return { text: `Nobody is scheduled on ${dateLabel(dateISO)}.` };
  }
  const lines = working.map((a) => {
    const m = ctx.members.find((x) => x.id === a.member_id);
    const g = ctx.groups.find((x) => x.id === a.group_id);
    return `• ${m?.name || "Unknown"} — ${a.shift_start}–${a.shift_end} (${g?.name || ""})`;
  });
  return { text: `On ${dateLabel(dateISO)}, ${working.length} shift${working.length === 1 ? "" : "s"} are scheduled:\n\n${lines.join("\n")}` };
}

function answerReschedule(ctx: ScheduleContext, member: TeamMember, question: string): AssistantAnswer {
  const q = question.toLowerCase();
  const fromMatch = q.match(/from\s+([a-z]+)/);
  const toMatch = q.match(/to\s+([a-z]+)/);
  const fromDay = fromMatch ? parseDayReference(fromMatch[1], ctx.dates) : null;
  const toDay = toMatch ? parseDayReference(toMatch[1], ctx.dates) : null;
  const shifts = memberShiftDates(ctx, member.id);
  if (shifts.length === 0) {
    return { text: `${member.name} has no shifts to reschedule in the current period.` };
  }
  const from = fromDay || shifts[0];
  const fromISO = formatDateISO(fromDay || new Date(shifts[0].assignment_date + "T00:00:00"));
  const shift = shifts.find((s) => s.assignment_date === fromISO);
  if (!shift) {
    return { text: `${member.name} is not scheduled on ${fromDay ? dateLabel(fromISO) : "that day"}. Their shifts: ${shifts.map((s) => dateLabel(s.assignment_date)).join(", ")}.` };
  }
  let to = toDay;
  if (!to) {
    const freeDates = ctx.dates.filter((d) => {
      const iso = formatDateISO(d);
      return iso !== fromISO && !ctx.assignments.some((a) => a.member_id === member.id && a.assignment_date === iso && a.status !== "Off");
    });
    to = freeDates[0];
  }
  if (!to) {
    return { text: `I couldn't find an open day to move ${member.name} to. Try "move ${member.name.split(" ")[0]} from X to Y" with a specific weekday.` };
  }
  const toISO = formatDateISO(to);
  if (toISO === fromISO) {
    return { text: `${member.name} is already scheduled on ${dateLabel(fromISO)}. Choose a different day to move them to.` };
  }
  const conflict = ctx.assignments.some((a) => a.member_id === member.id && a.assignment_date === toISO && a.status !== "Off");
  if (conflict) {
    return { text: `${member.name} already has a shift on ${dateLabel(toISO)}. Pick a day they're off, or remove that shift first.` };
  }
  return {
    text: `I can move ${member.name} from ${dateLabel(fromISO)} (${shift.shift_start}–${shift.shift_end}) to ${dateLabel(toISO)} at the same time. Coverage on ${dateLabel(fromISO)} would drop while they're gone.`,
    proposal: {
      title: `Move ${member.name}: ${dateLabel(fromISO)} → ${dateLabel(toISO)}`,
      detail: `Keeps the same hours (${shift.shift_start}–${shift.shift_end}, status ${shift.status}). Requires your approval.`,
      apply: async () => {
        await data.deleteShiftAssignment(member.id, fromISO);
        await data.upsertShiftAssignment({
          member_id: member.id,
          group_id: member.group_id,
          assignment_date: toISO,
          shift_start: shift.shift_start,
          shift_end: shift.shift_end,
          status: shift.status,
          is_published: false,
        });
        await data.logChange(`Moved ${member.name} from ${fromISO} to ${toISO} via AI Assistant`, "Assistant");
        return `Moved ${member.name} to ${dateLabel(toISO)}.`;
      },
    },
  };
}

function answerOverview(ctx: ScheduleContext): AssistantAnswer {
  const totalShifts = ctx.assignments.filter((a) => a.status === "Scheduled" || a.status === "Premium Pay").length;
  const totalHours = ctx.assignments
    .filter((a) => (a.status === "Scheduled" || a.status === "Premium Pay") && a.shift_start && a.shift_end)
    .reduce((sum, a) => sum + shiftDuration(a.shift_start!, a.shift_end!), 0);
  const upcoming = ctx.holidays
    .filter((h) => h.holiday_date >= formatDateISO(new Date()))
    .slice(0, 3);
  return {
    text: `Here's the current picture (${dateLabel(formatDateISO(ctx.dates[0]))} – ${dateLabel(formatDateISO(ctx.dates[ctx.dates.length - 1]))}):\n\n• ${ctx.members.length} team members across ${ctx.groups.length} groups\n• ${totalShifts} scheduled shifts totaling ${hoursLabel(Math.round(totalHours))}\n• ${upcoming.length ? `Upcoming holidays: ${upcoming.map((h) => `${h.name} (${dateLabel(h.holiday_date)})`).join(", ")}` : "No upcoming holidays defined"}\n\nAsk me things like "where do I have the most gaps?", "what would happen if I removed someone from the schedule?", "who worked on the last holiday?", or "what shift do we most need coverage for?" You can also ask me to move an employee between days — I'll propose the change and only apply it with your approval.`,
    suggestions: ["Where do I have the most gaps?", "What shift do we most need the coverage?"],
  };
}

// ---- Router ----

export async function answerQuestion(question: string, ctx: ScheduleContext): Promise<AssistantAnswer> {
  const q = question.toLowerCase();
  const member = findMember(ctx, question);

  if ((q.includes("move") || q.includes("reschedule") || q.includes("swap")) && member) {
    return answerReschedule(ctx, member, question);
  }
  if (member && (q.includes("remove") || q.includes("what if") || q.includes("without") || q.includes("fire") || q.includes("call out") || q.includes("callout"))) {
    return answerRemovalImpact(ctx, member);
  }
  if (q.includes("holiday")) {
    return answerHolidayWorkers(ctx);
  }
  if (q.includes("gap") || q.includes("short") || q.includes("understaff") || q.includes("hole")) {
    return answerGaps(ctx);
  }
  if (q.includes("hire") || q.includes("most need") || q.includes("coverage for") || q.includes("new position")) {
    return answerCoverageNeed(ctx);
  }
  if (q.includes("who") && (q.includes("work") || q.includes("schedul") || q.includes("on "))) {
    return answerWhoWorking(ctx, question);
  }
  if (member) {
    const shifts = memberShiftDates(ctx, member.id);
    if (shifts.length === 0) {
      return { text: `${member.name} has no scheduled shifts in the current period.` };
    }
    const lines = shifts.map((s) => `• ${dateLabel(s.assignment_date)} — ${s.shift_start}–${s.shift_end} (${s.status})`);
    return { text: `${member.name}'s schedule this period:\n\n${lines.join("\n")}` };
  }
  return answerOverview(ctx);
}
