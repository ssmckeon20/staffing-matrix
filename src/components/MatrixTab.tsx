import { useEffect, useState, useMemo, useCallback } from "react";
import { Fragment } from "react";
import type { AssignmentGroup, TeamMember, ShiftAssignment, VolumePlan, FteBudget, PublishedState, ViewType, MatrixMode, ShiftStatus, PremiumPayType } from "../lib/types";
import * as data from "../lib/data";
import { Icon, Button, Modal } from "./ui";
import {
  GROUP_COLORS, getCurrentBiweeklyStart, getDateRange, formatDateRange, formatDateISO, addDays,
  dayNames, isWeekend, generateHourLabels, hourLabel, formatHour24, slotEndForHour,
  inputTimeValue, shiftDuration, isActiveAt, formatShiftDisplay, hoursLabel,
  formatDate,
} from "../lib/helpers";

interface ToastFn { (msg: string): void; }

export default function MatrixTab({ toast }: { toast: ToastFn }) {
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [volumePlans, setVolumePlans] = useState<Record<string, VolumePlan>>({});
  const [fteBudgets, setFteBudgets] = useState<Record<string, FteBudget>>({});
  const [publishedStates, setPublishedStates] = useState<Record<string, PublishedState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [matrixMode, setMatrixMode] = useState<MatrixMode>("schedule");
  const [viewType, setViewType] = useState<ViewType>("bi-weekly");
  const [rangeStart, setRangeStart] = useState<Date>(getCurrentBiweeklyStart());

  // Payroll period start — user-configurable to match company pay periods
  const [payPeriodStart, setPayPeriodStart] = useState<string>(() => {
    const stored = typeof localStorage !== "undefined" && localStorage.getItem("payPeriodStart");
    return stored || formatDateISO(getCurrentBiweeklyStart());
  });

  // Collapsed hour rows
  const [collapsedHours, setCollapsedHours] = useState<Set<number>>(new Set());

  // All-groups budgeted targets
  const [editingAllGroupsBudget, setEditingAllGroupsBudget] = useState(false);
  const [allGroupsBudgetInput, setAllGroupsBudgetInput] = useState("");
  const [allGroupsBudget, setAllGroupsBudget] = useState<number>(() => {
    const stored = typeof localStorage !== "undefined" && localStorage.getItem("allGroupsBudgetFte");
    return stored ? Number(stored) : 0;
  });

  // Draft tracking
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
  const [undoStack, setUndoStack] = useState<{ description: string; action: () => Promise<void> }[]>([]);

  // Editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editingDate, setEditingDate] = useState<string>("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editStatus, setEditStatus] = useState<ShiftStatus>("Scheduled");
  const [editPremiumType, setEditPremiumType] = useState<PremiumPayType | "">("");
  const [editPremiumAmount, setEditPremiumAmount] = useState<number>(0);
  const [editMultiDays, setEditMultiDays] = useState<Set<string>>(new Set());
  const [showCopyPrompt, setShowCopyPrompt] = useState(false);

  // Conflict resolution
  const [conflict, setConflict] = useState<{
    message: string;
    onReplace: () => void;
    onIgnore: () => void;
  } | null>(null);

  // Assign panel
  const [assignPanel, setAssignPanel] = useState<{ hour: number; dateISO: string | null } | null>(null);
  const [pendingRowMembers, setPendingRowMembers] = useState<Map<number, TeamMember[]>>(new Map());
  const [assignSearch, setAssignSearch] = useState("");
  const [borrowMode, setBorrowMode] = useState(false);

  // FTE budget editing
  const [editingFte, setEditingFte] = useState(false);
  const [fteInput, setFteInput] = useState("");

  // Volume plan editing state
  const [vpEnabled, setVpEnabled] = useState(false);
  const [vpStart, setVpStart] = useState("06:00");
  const [vpEnd, setVpEnd] = useState("22:00");
  const [vpRate, setVpRate] = useState(2);
  const [vpWeekendMult, setVpWeekendMult] = useState(0.65);
  const [vpVolume, setVpVolume] = useState<number[]>(Array(24).fill(4));
  const [vpManualStaff, setVpManualStaff] = useState<number[]>(Array(24).fill(0));
  const [slotAdjustments, setSlotAdjustments] = useState<Record<number, number>>(() => {
    if (typeof localStorage === "undefined") return {};
    const stored = localStorage.getItem("slotAdjustments");
    return stored ? JSON.parse(stored) : {};
  });

  // Persist slot adjustments to localStorage
  const persistSlotAdjustments = (adj: Record<number, number>) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("slotAdjustments", JSON.stringify(adj));
    }
  };

  const dates = useMemo(() => getDateRange(viewType, rangeStart), [viewType, rangeStart]);
  const rangeEnd = dates[dates.length - 1];

  const loadAll = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([data.fetchGroups(), data.fetchAllMembers()]);
      setGroups(g);
      setMembers(m);
      if (g.length > 0 && !selectedGroup) setSelectedGroup(g[0].id);

      // Load volume plans, FTE budgets, published states for all groups
      const vpMap: Record<string, VolumePlan> = {};
      const fbMap: Record<string, FteBudget> = {};
      const psMap: Record<string, PublishedState> = {};
      for (const group of g) {
        const [vp, fb, ps] = await Promise.all([
          data.fetchVolumePlan(group.id),
          data.fetchFteBudget(group.id),
          data.fetchPublishedState(group.id),
        ]);
        if (vp) vpMap[group.id] = vp;
        if (fb) fbMap[group.id] = fb;
        if (ps) psMap[group.id] = ps;
      }
      setVolumePlans(vpMap);
      setFteBudgets(fbMap);
      setPublishedStates(psMap);

      if (selectedGroup || g[0]) {
        const gid = selectedGroup || g[0].id;
        const a = await data.fetchShiftAssignments(gid, dates[0], rangeEnd);
        setAssignments(a);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Reload assignments when group or date range changes
  useEffect(() => {
    if (!selectedGroup) return;
    // Load persisted slot adjustments for this group
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(`slotAdj_${selectedGroup}`);
      setSlotAdjustments(stored ? JSON.parse(stored) : {});
    }
    (async () => {
      try {
        const a = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
        setAssignments(a);
        setHasDraftChanges(a.some((x) => !x.is_published));
      } catch (e) { setError(String(e)); }
    })();
  }, [selectedGroup, rangeStart, viewType]);

  // Load volume plan into editing state when group changes
  useEffect(() => {
    const vp = volumePlans[selectedGroup];
    if (vp) {
      setVpEnabled(vp.enabled);
      setVpStart(vp.hours_of_service_start);
      setVpEnd(vp.hours_of_service_end);
      setVpRate(vp.productivity_rate);
      setVpWeekendMult(vp.weekend_multiplier);
      setVpVolume(Array.isArray(vp.hourly_volume) ? vp.hourly_volume : JSON.parse(vp.hourly_volume as unknown as string));
      setVpManualStaff(Array.isArray(vp.manual_staff) && vp.manual_staff.length > 0 ? vp.manual_staff : Array(24).fill(0));
    } else {
      const g = groups.find((x) => x.id === selectedGroup);
      if (g) {
        setVpEnabled(false);
        setVpStart(g.hours_of_service_start);
        setVpEnd(g.hours_of_service_end);
      }
    }
  }, [selectedGroup, volumePlans, groups]);

  const currentGroup = groups.find((g) => g.id === selectedGroup);
  const groupMembers = members.filter((m) => m.group_id === selectedGroup);

  const opsHours = useMemo(() => {
    const start = vpEnabled ? vpStart : (currentGroup?.hours_of_service_start || "06:00");
    const end = vpEnabled ? vpEnd : (currentGroup?.hours_of_service_end || "22:00");
    return generateHourLabels(start, end);
  }, [vpEnabled, vpStart, vpEnd, currentGroup]);

  const getMemberAssignment = (memberId: string, dateISO: string): ShiftAssignment | undefined => {
    return assignments.find((a) => a.member_id === memberId && a.assignment_date === dateISO);
  };

  const getMemberShiftForDate = (memberId: string, dateISO: string): { start: string | null; end: string | null; status: ShiftStatus } => {
    const a = getMemberAssignment(memberId, dateISO);
    if (a) return { start: a.shift_start, end: a.shift_end, status: a.status };
    return { start: null, end: null, status: "Off" };
  };

  // Calculate scheduled hours for a member across all dates (excluding unpaid breaks)
  const memberScheduledHours = (member: TeamMember): number => {
    let total = 0;
    for (const date of dates) {
      const dateISO = formatDateISO(date);
      const shift = getMemberShiftForDate(member.id, dateISO);
      if ((shift.status === "Scheduled" || shift.status === "Premium Pay") && shift.start && shift.end) {
        const dur = shiftDuration(shift.start, shift.end);
        total += Math.max(0, dur - member.daily_unpaid_break);
      }
    }
    return Math.round(total * 10) / 10;
  };

  // Calculate weekly hours for OT detection
  const memberWeeklyHours = (member: TeamMember, weekIndex: number): number => {
    const weekDates = dates.slice(weekIndex * 7, (weekIndex + 1) * 7);
    let total = 0;
    for (const date of weekDates) {
      const dateISO = formatDateISO(date);
      const shift = getMemberShiftForDate(member.id, dateISO);
      if ((shift.status === "Scheduled" || shift.status === "Premium Pay") && shift.start && shift.end) {
        const dur = shiftDuration(shift.start, shift.end);
        total += Math.max(0, dur - member.daily_unpaid_break);
      }
    }
    return Math.round(total * 10) / 10;
  };

  const memberOvertimeHours = (member: TeamMember): number => {
    const weekCount = Math.ceil(dates.length / 7);
    let ot = 0;
 for (let w = 0; w < weekCount; w++) {
   const weekHrs = memberWeeklyHours(member, w);
   ot += Math.max(0, weekHrs - member.overtime_threshold);
 }
 return Math.round(ot * 10) / 10;
  };

  // Effective hourly rate for a shift assignment including premium pay
  const effectiveRate = (assignment: ShiftAssignment | undefined, member: TeamMember): number => {
    const baseRate = member.hourly_rate || 0;
    if (!assignment || assignment.status !== "Premium Pay" || !assignment.premium_pay_type) return baseRate;
    const amt = assignment.premium_pay_amount || 0;
    if (assignment.premium_pay_type === "base_plus") return baseRate + amt;
    if (assignment.premium_pay_type === "rate_plus_percent") return Math.round(baseRate * (1 + amt / 100) * 100) / 100;
    if (assignment.premium_pay_type === "other") return amt;
    return baseRate;
  };

  // Calculate labor spend for current group
  const laborSpend = useMemo(() => {
    let total = 0;
    for (const member of groupMembers) {
      const weekCount = Math.ceil(dates.length / 7);
      let memberTotal = 0;
      for (let w = 0; w < weekCount; w++) {
        const weekDates = dates.slice(w * 7, (w + 1) * 7);
        let weekHours = 0;
        for (const date of weekDates) {
          const dateISO = formatDateISO(date);
          const shift = getMemberShiftForDate(member.id, dateISO);
          if ((shift.status === "Scheduled" || shift.status === "Premium Pay") && shift.start && shift.end) {
            const a = getMemberAssignment(member.id, dateISO);
            const rate = effectiveRate(a, member);
            const dur = Math.max(0, shiftDuration(shift.start, shift.end) - member.daily_unpaid_break);
            memberTotal += rate * dur;
            weekHours += dur;
          }
        }
        // Apply overtime: hours over threshold at 1.5x base rate
        const otHrs = Math.max(0, weekHours - member.overtime_threshold);
        if (otHrs > 0) {
          const baseRate = member.hourly_rate || 0;
          memberTotal += otHrs * baseRate * 0.5; // add the 0.5x premium on top of already-counted base
        }
      }
      total += memberTotal;
    }
    return Math.round(total * 100) / 100;
  }, [groupMembers, assignments, dates]);

  // Cross-group totals
  const allGroupsFte = useMemo(() => {
    let totalProductive = 0;
    let totalNonProductive = 0;
    let totalHours = 0;
    let totalLaborSpend = 0;
    for (const g of groups) {
      const gMembers = members.filter((m) => m.group_id === g.id);
      for (const m of gMembers) {
        if (m.status === "Productive") totalProductive++;
        else totalNonProductive++;
        const schedHrs = memberScheduledHours(m);
        totalHours += schedHrs;
      }
    }
    return {
      totalProductive,
      totalNonProductive,
      totalFTE: Math.round((totalHours / 40) * 100) / 100,
      totalHours,
      totalLaborSpend,
    };
  }, [groups, members, assignments, dates]);

  // Compute week boundaries based on user's payroll period start
  const weekBoundaries = useMemo(() => {
    const ppStart = new Date(payPeriodStart + "T00:00:00");
    const periodStart = dates[0];
    const daysFromPayStart = Math.floor((periodStart.getTime() - ppStart.getTime()) / (1000 * 60 * 60 * 24));
    const week1Start = dates[0];
    const week1End = dates[Math.min(6, dates.length - 1)];
    const week2Start = dates[Math.min(7, dates.length - 1)];
    const week2End = dates[Math.min(13, dates.length - 1)];
    return { week1Start, week1End, week2Start, week2End, week1Dates: dates.slice(0, 7), week2Dates: dates.slice(7, 14) };
  }, [dates, payPeriodStart]);

  // FTE calculations with productive/non-productive split
  const fteCalculations = useMemo(() => {
    const week1Dates = weekBoundaries.week1Dates;
    const week2Dates = weekBoundaries.week2Dates;
    const calcWeekHours = (weekDates: Date[], productiveOnly: boolean) => {
      let total = 0;
      for (const member of groupMembers) {
        if (productiveOnly && member.status !== "Productive") continue;
        if (!productiveOnly && member.status === "Productive") continue;
        for (const date of weekDates) {
          const dateISO = formatDateISO(date);
          const shift = getMemberShiftForDate(member.id, dateISO);
          if ((shift.status === "Scheduled" || shift.status === "Premium Pay") && shift.start && shift.end) {
            total += shiftDuration(shift.start, shift.end);
          }
        }
      }
      return Math.round(total * 10) / 10;
    };
    const week1Productive = calcWeekHours(week1Dates, true);
    const week2Productive = calcWeekHours(week2Dates, true);
    const week1NonProd = calcWeekHours(week1Dates, false);
    const week2NonProd = calcWeekHours(week2Dates, false);
    const totalProductive = week1Productive + week2Productive;
    const totalNonProd = week1NonProd + week2NonProd;
    const totalHours = totalProductive + totalNonProd;
    const totalFTE = Math.round((totalProductive / 40) * 100) / 100;
    const budget = fteBudgets[selectedGroup]?.budgeted_fte || 0;
    const fteVariance = budget > 0 ? Math.round((totalFTE / budget) * 100) : 0;
    const fteOutOfRange = budget > 0 && (fteVariance < 95 || fteVariance > 105);
    return { week1Productive, week2Productive, week1NonProd, week2NonProd, totalProductive, totalNonProd, totalHours, totalFTE, budget, fteVariance, fteOutOfRange };
  }, [groupMembers, assignments, dates, selectedGroup, fteBudgets]);

  // Staff at each hour per day
  const staffAtHour = (hour: number, date: Date): number => {
    const dateISO = formatDateISO(date);
    return groupMembers.filter((m) => {
      if (m.status !== "Productive") return false;
      const shift = getMemberShiftForDate(m.id, dateISO);
      if ((shift.status !== "Scheduled" && shift.status !== "Premium Pay") || !shift.start || !shift.end) return false;
      return isActiveAt(shift.start, shift.end, hour);
    }).length;
  };

  // Volume plan calculations
  const neededAt = (hour: number, weekend: boolean): number => {
    if (!vpEnabled) return 1;
    const vol = vpVolume[hour] || 0;
    const adjustedVol = weekend ? Math.round(vol * vpWeekendMult) : vol;
    if (vpRate > 0) {
      return Math.max(1, Math.ceil(adjustedVol / vpRate));
    }
    // Manual staff mode
    return Math.max(0, vpManualStaff[hour] || 0);
  };

  // Dynamic hourly grouping: members appear under the hour their ACTUAL scheduled shift starts.
  // If they have no scheduled assignment on any displayed date, they fall back to their default shift hour.
  // An employee who changes from 07:00 to 06:00 will immediately move to the 06:00 row.
  const membersByStartHour = useMemo(() => {
    const map = new Map<number, TeamMember[]>();
    const dateISOs = dates.map((d) => formatDateISO(d));
    for (const member of groupMembers) {
      const startHours = new Set<number>();
      for (const dateISO of dateISOs) {
        const shift = getMemberShiftForDate(member.id, dateISO);
        if ((shift.status === "Scheduled" || shift.status === "Premium Pay") && shift.start) {
          startHours.add(parseInt(shift.start.split(":")[0]));
        }
      }
      for (const h of startHours) {
        if (!map.has(h)) map.set(h, []);
        map.get(h)!.push(member);
      }
    }
    // Merge in pending row members (added via "Assign employee" but not yet scheduled)
    for (const [h, pending] of pendingRowMembers) {
      if (!map.has(h)) map.set(h, []);
      const existing = new Set(map.get(h)!.map((m) => m.id));
      for (const m of pending) {
        if (!existing.has(m.id)) map.get(h)!.push(m);
      }
    }
    return map;
  }, [groupMembers, assignments, dates, pendingRowMembers]);

  // Four slots per hour by default, plus user adjustments
  const slotsForHour = (hour: number): number => {
    return Math.max(0, 4 + (slotAdjustments[hour] || 0));
  };

  const updateSlotAdjustment = (hour: number, delta: number) => {
    setSlotAdjustments((prev) => {
      const next = { ...prev, [hour]: (prev[hour] || 0) + delta };
      if (typeof localStorage !== "undefined" && selectedGroup) {
        localStorage.setItem(`slotAdj_${selectedGroup}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const openEditor = (member: TeamMember, date: Date, hour: number) => {
    const dateISO = formatDateISO(date);
    const shift = getMemberShiftForDate(member.id, dateISO);
    setEditingMember(member);
    setEditingDate(dateISO);
    setEditMultiDays(new Set());
    if (shift.start && (shift.status === "Scheduled" || shift.status === "Premium Pay")) {
      setEditStart(shift.start);
      setEditEnd(shift.end || "");
      setEditStatus(shift.status);
      const a = getMemberAssignment(member.id, dateISO);
      setEditPremiumType(a?.premium_pay_type || "");
      setEditPremiumAmount(a?.premium_pay_amount || 0);
    } else if (shift.status !== "Scheduled" && shift.status !== "Off" && shift.status !== "Premium Pay") {
      setEditStart("");
      setEditEnd("");
      setEditStatus(shift.status);
      setEditPremiumType("");
      setEditPremiumAmount(0);
    } else {
      setEditStart(`${String(hour).padStart(2, "0")}:00`);
      setEditEnd(slotEndForHour(hour));
      setEditStatus("Scheduled");
      setEditPremiumType("");
      setEditPremiumAmount(0);
    }
    setEditorOpen(true);
  };

  const saveShift = async () => {
    if (!editingMember) return;
    const status: ShiftStatus = editStatus;
    const isPremium = status === "Premium Pay";
    const shiftStart = (status === "Scheduled" || isPremium) ? editStart : null;
    const shiftEnd = (status === "Scheduled" || isPremium) ? editEnd : null;
    const premiumType = isPremium && editPremiumType ? editPremiumType : null;
    const premiumAmt = isPremium && editPremiumType ? editPremiumAmount : null;

    const datesToSave = [editingDate, ...Array.from(editMultiDays).filter((d) => d !== editingDate)];

    const doSave = async () => {
      for (const dateISO of datesToSave) {
        await data.upsertShiftAssignment({
          member_id: editingMember.id,
          group_id: selectedGroup,
          assignment_date: dateISO,
          shift_start: shiftStart,
          shift_end: shiftEnd,
          status,
          is_published: false,
          borrowed_from_group_id: editingMember.group_id !== selectedGroup ? editingMember.group_id : null,
          premium_pay_type: premiumType as any,
          premium_pay_amount: premiumAmt as any,
        });
      }
      await data.logChange(`Updated ${editingMember.name}'s shift on ${editingDate} in ${currentGroup?.name}${datesToSave.length > 1 ? ` (${datesToSave.length} days)` : ""}`, "Matrix");
      const a = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
      setAssignments(a);
      setHasDraftChanges(true);
      setEditorOpen(false);
      toast(`Shift updated for ${editingMember.name}${datesToSave.length > 1 ? ` (${datesToSave.length} days)` : ""}`);
    };

    // Check for existing assignment on same day for this member in another group
    const existingOtherGroup = await data.fetchShiftForMemberOnDate(editingMember.id, editingDate);
    const hasOtherGroupAssignment = existingOtherGroup && existingOtherGroup.group_id !== selectedGroup;

    if (hasOtherGroupAssignment) {
      setConflict({
        message: `${editingMember.name} already has a shift in another group on ${editingDate}. Replace the existing assignment?`,
        onReplace: async () => {
          await data.deleteShiftAssignment(editingMember.id, editingDate);
          await doSave();
          setConflict(null);
        },
        onIgnore: () => { setConflict(null); setEditorOpen(false); },
      });
    } else {
      const existing = getMemberAssignment(editingMember.id, editingDate);
      if (existing && (existing.status === "Scheduled" || existing.status === "Premium Pay") && existing.shift_start) {
        setConflict({
          message: `${editingMember.name} already has a scheduled shift on ${editingDate}. Replace it?`,
          onReplace: async () => { await doSave(); setConflict(null); },
          onIgnore: () => { setConflict(null); setEditorOpen(false); },
        });
      } else {
        await doSave();
      }
    }
  };

  const removeShift = async () => {
    if (!editingMember) return;
    await data.deleteShiftAssignment(editingMember.id, editingDate);
    await data.logChange(`Removed ${editingMember.name}'s shift on ${editingDate}`, "Matrix");
    const a = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
    setAssignments(a);
    setHasDraftChanges(true);
    setEditorOpen(false);
    toast(`Shift removed for ${editingMember.name}`);
  };

  const assignToRow = (member: TeamMember, hour: number) => {
    setPendingRowMembers((prev) => {
      const next = new Map(prev);
      const list = next.get(hour) || [];
      if (!list.some((m) => m.id === member.id)) {
        next.set(hour, [...list, member]);
      }
      return next;
    });
    setAssignPanel(null);
    toast(`${member.name} added to ${formatHour24(hour)} row — click a date to schedule`);
  };

  const assignToOpenSlot = async (member: TeamMember, hour: number, dateISO: string) => {
    const repShiftEnd = slotEndForHour(hour, 8.5);
    const existing = await data.fetchShiftForMemberOnDate(member.id, dateISO);
    const hasOtherAssignment = existing && existing.group_id !== selectedGroup;
    const hasSameDayAssignment = existing && existing.group_id === selectedGroup && (existing.status === "Scheduled" || existing.status === "Premium Pay");

    const doAssign = async () => {
      await data.upsertShiftAssignment({
        member_id: member.id,
        group_id: selectedGroup,
        assignment_date: dateISO,
        shift_start: `${String(hour).padStart(2, "0")}:00`,
        shift_end: repShiftEnd,
        status: "Scheduled",
        is_published: false,
        borrowed_from_group_id: member.group_id !== selectedGroup ? member.group_id : null,
      });
      await data.logChange(`Assigned ${member.name} to ${formatHour24(hour)} shift on ${dateISO} in ${currentGroup?.name}`, "Matrix");
      const a = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
      setAssignments(a);
      setHasDraftChanges(true);
      setAssignPanel(null);
      toast(`${member.name} assigned to ${formatHour24(hour)} shift`);
    };

    if (hasOtherAssignment) {
      setConflict({
        message: `${member.name} already has a shift in another group on ${dateISO}. Replace the existing assignment?`,
        onReplace: async () => {
          await data.deleteShiftAssignment(member.id, dateISO);
          await doAssign();
          setConflict(null);
        },
        onIgnore: () => { setConflict(null); setAssignPanel(null); },
      });
    } else if (hasSameDayAssignment) {
      setConflict({
        message: `${member.name} already has a scheduled shift on ${dateISO}. Replace it?`,
        onReplace: async () => { await doAssign(); setConflict(null); },
        onIgnore: () => { setConflict(null); setAssignPanel(null); },
      });
    } else {
      await doAssign();
    }
  };

  const handleSaveDraft = async () => {
    // Draft assignments are already saved to DB; just log it
    await data.logChange(`Saved draft for ${currentGroup?.name}`, "Save Draft");
    toast("Draft saved");
  };

  const handlePublish = async () => {
    if (!currentGroup) return;
    await data.publishSchedule(selectedGroup, currentGroup.name);
    if (typeof localStorage !== "undefined") localStorage.removeItem(`slotAdj_${selectedGroup}`);
    setSlotAdjustments({});
    const a = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
    setAssignments(a);
    setHasDraftChanges(false);
    // Reload published states
    const ps = await data.fetchPublishedState(selectedGroup);
    if (ps) setPublishedStates({ ...publishedStates, [selectedGroup]: ps });
    toast("Schedules published to Employee Schedule");
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) { toast("Nothing to undo"); return; }
    const last = undoStack[undoStack.length - 1];
    await last.action();
    setUndoStack(undoStack.slice(0, -1));
    const a = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
    setAssignments(a);
    toast(`Undid: ${last.description}`);
  };

  const handleRevert = async () => {
    if (!currentGroup) return;
    await data.revertToLastPublished(selectedGroup, currentGroup.name);
    if (typeof localStorage !== "undefined") localStorage.removeItem(`slotAdj_${selectedGroup}`);
    setSlotAdjustments({});
    const a = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
    setAssignments(a);
    setHasDraftChanges(false);
    toast("Reverted to last published schedule");
  };

  const saveVolumePlan = async () => {
    if (!selectedGroup) return;
    await data.updateVolumePlan(selectedGroup, {
      enabled: vpEnabled,
      hours_of_service_start: vpStart,
      hours_of_service_end: vpEnd,
      productivity_rate: vpRate,
      weekend_multiplier: vpWeekendMult,
      hourly_volume: vpVolume,
      manual_staff: vpManualStaff,
    });
    await data.logChange(`Updated volume plan for ${currentGroup?.name}`, "Volume Plan");
    toast("Volume plan saved");
  };

  const saveFteBudget = async () => {
    if (!selectedGroup) return;
    await data.upsertFteBudget(selectedGroup, Number(fteInput) || 0);
    const fb = await data.fetchFteBudget(selectedGroup);
    if (fb) setFteBudgets({ ...fteBudgets, [selectedGroup]: fb });
    setEditingFte(false);
    toast("FTE budget saved");
  };

  const handleCopyFromPrevious = async () => {
    if (!selectedGroup) return;
    const prevEnd = addDays(dates[0], -1);
    const periodLen = dates.length;
    const prevStart = addDays(prevEnd, -(periodLen - 1));
    const prevAssignments = await data.fetchShiftAssignments(selectedGroup, prevStart, prevEnd);
    if (prevAssignments.length === 0) {
      toast("No shifts found in previous period to copy");
      setShowCopyPrompt(false);
      return;
    }
    for (const a of prevAssignments) {
      if (a.status !== "Scheduled" && a.status !== "Premium Pay") continue;
      const prevDate = new Date(a.assignment_date + "T00:00:00");
      const dayOfWeek = prevDate.getDay();
      const newDate = dates.find((d) => d.getDay() === dayOfWeek);
      if (!newDate) continue;
      const newDateISO = formatDateISO(newDate);
      await data.upsertShiftAssignment({
        member_id: a.member_id,
        group_id: selectedGroup,
        assignment_date: newDateISO,
        shift_start: a.shift_start,
        shift_end: a.shift_end,
        status: a.status,
        is_published: false,
        borrowed_from_group_id: a.borrowed_from_group_id,
        premium_pay_type: a.premium_pay_type as any,
        premium_pay_amount: a.premium_pay_amount as any,
      });
    }
    await data.logChange(`Copied schedule from previous period for ${currentGroup?.name}`, "Matrix");
    const refreshed = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
    setAssignments(refreshed);
    setHasDraftChanges(true);
    setShowCopyPrompt(false);
    toast(`Copied ${prevAssignments.length} shifts from previous period`);
  };

  const shiftViewType = (newType: ViewType) => {
    setViewType(newType);
    setRangeStart(getCurrentBiweeklyStart());
  };

  const publishedInfo = publishedStates[selectedGroup];
  const publishedLabel = publishedInfo?.last_published_at
    ? new Date(publishedInfo.last_published_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Not Yet Published";

  const allGroupsFteVariance = allGroupsBudget > 0 ? Math.round((allGroupsFte.totalFTE / allGroupsBudget) * 100) : 0;
  const allGroupsFteOutOfRange = allGroupsBudget > 0 && (allGroupsFteVariance < 95 || allGroupsFteVariance > 105);

  const availableToAssign = borrowMode
    ? members
    : groupMembers;

  if (loading) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      {error && <div className="error-banner"><Icon name="alert" size={16} /> {error}</div>}

      <section className="page-heading">
        <div className="heading-top-row">
          <div>
            <div className="title-row">
              <h1>Staffing Matrix</h1>
              {hasDraftChanges && <span className="status-pill">Unsaved Draft</span>}
            </div>
            <p>Build A Schedule Around Expected Demand.</p>
          </div>
          {/* Productivity indicators next to heading */}
          <div className="heading-metrics">
            <article className="heading-metric" onClick={() => { setEditingAllGroupsBudget(true); setAllGroupsBudgetInput(String(allGroupsBudget || "")); }} style={{ cursor: "pointer" }}>
              <span className="heading-metric-label">All Groups FTE</span>
              <div className="heading-metric-value">{allGroupsFte.totalFTE}</div>
              {allGroupsBudget > 0 ? (
                <small className={allGroupsFteOutOfRange ? "fte-out-of-range" : "fte-in-range"}>vs {allGroupsBudget} budgeted ({allGroupsFteVariance}%)</small>
              ) : (
                <small>Click To Set Budget</small>
              )}
            </article>
            <article className="heading-metric">
              <span className="heading-metric-label">Total Hours</span>
              <div className="heading-metric-value">{allGroupsFte.totalHours}</div>
              <small>{allGroupsFte.totalProductive} Productive · {allGroupsFte.totalNonProductive} Non-Productive</small>
            </article>
          </div>
        </div>
        <div className="heading-actions">
          <Button variant="icon" icon="chevronLeft" onClick={() => setRangeStart(addDays(rangeStart, viewType === "daily" ? -1 : -7))} />
          <button className="date-control">
            <Icon name="calendar" />
            <span>{formatDateRange(dates[0], rangeEnd)}</span>
            <Icon name="chevronDown" size={16} />
          </button>
          <Button variant="icon" icon="chevronRight" onClick={() => setRangeStart(addDays(rangeStart, viewType === "daily" ? 1 : 7))} />
        </div>
      </section>

      {/* View type selector + payroll period */}
      <div className="view-type-bar">
        <label>View:</label>
        <div className="view-toggle">
          <button className={viewType === "daily" ? "active" : ""} onClick={() => shiftViewType("daily")}>Daily</button>
          <button className={viewType === "weekly" ? "active" : ""} onClick={() => shiftViewType("weekly")}>Weekly</button>
          <button className={viewType === "bi-weekly" ? "active" : ""} onClick={() => shiftViewType("bi-weekly")}>Bi-Weekly</button>
          <button className={viewType === "monthly" ? "active" : ""} onClick={() => shiftViewType("monthly")}>Monthly</button>
        </div>
        <div className="pay-period-control">
          <label>Pay Period Start:</label>
          <input type="date" value={payPeriodStart} onChange={(e) => { setPayPeriodStart(e.target.value); if (typeof localStorage !== "undefined") localStorage.setItem("payPeriodStart", e.target.value); }} />
        </div>
        {matrixMode === "schedule" && (
          <button className="copy-schedule-btn" onClick={() => setShowCopyPrompt(true)}>
            <Icon name="refresh" size={13} /> Copy From Previous Period
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <Icon name="layout" size={32} />
          <h3>No assignment groups yet</h3>
          <p>Create groups in the Team tab to start building schedules.</p>
        </div>
      ) : (
        <>
          {/* Group tabs */}
          <div className="matrix-group-tabs">
            {groups.map((g, i) => (
              <button
                key={g.id}
                className={`matrix-team-tab ${selectedGroup === g.id ? "active" : ""} ${GROUP_COLORS[i % GROUP_COLORS.length]}`}
                onClick={() => setSelectedGroup(g.id)}
              >
                {g.name}
              </button>
            ))}
          </div>

          {/* Per-group Metrics */}
          <section className="metrics">
            <article className="metric" onClick={() => { setEditingFte(true); setFteInput(String(fteCalculations.budget || "")); }} style={{ cursor: "pointer" }}>
              <div className="metric-top"><span>FTE (Scheduled)</span><Icon name="team" size={16} /></div>
              <div className="metric-value">{fteCalculations.totalFTE}</div>
              <small>
                {fteCalculations.budget > 0 ? (
                  <span className={fteCalculations.fteOutOfRange ? "fte-out-of-range" : "fte-in-range"}>
                    vs {fteCalculations.budget} budgeted ({fteCalculations.fteVariance}%)
                  </span>
                ) : (
                  <span>Click to set budget</span>
                )}
              </small>
            </article>
            <article className="metric">
              <div className="metric-top"><span>Scheduled Hours</span></div>
              <div className="metric-value">{fteCalculations.totalHours}</div>
              <small>Wk1: {fteCalculations.week1Productive} Prod / {fteCalculations.week1NonProd} Non-Prod · Wk2: {fteCalculations.week2Productive} Prod / {fteCalculations.week2NonProd} Non-Prod</small>
            </article>
            <article className="metric">
              <div className="metric-top"><span>Labor Spend</span></div>
              <div className="metric-value">${laborSpend.toLocaleString()}</div>
              <small>Including OT & premium pay</small>
            </article>
            <article className="metric">
              <div className="metric-top"><span>Published</span><Icon name="check" size={16} /></div>
              <div className="metric-value" style={{ fontSize: "14px" }}>{publishedLabel}</div>
              <small>{hasDraftChanges ? "Draft changes pending" : "No draft changes"}</small>
            </article>
          </section>

          {/* Draft status + action buttons */}
          <div className="matrix-action-bar">
            <div className="draft-status">
              {hasDraftChanges && (
                <div className="draft-warning">
                  <Icon name="alert" size={14} /> Staffing matrix saved but not published
                </div>
              )}
            </div>
            <div className="matrix-actions">
              <Button icon="undo" onClick={handleUndo}>Undo last change</Button>
              <Button icon="refresh" onClick={handleRevert}>Revert to published</Button>
              <Button icon="save" onClick={handleSaveDraft}>Save draft</Button>
              <Button variant="primary" icon="check" onClick={handlePublish}>Publish schedules</Button>
            </div>
          </div>

          {/* Matrix Card */}
          <section className="matrix-card">
            <div className="card-header matrix-toolbar">
              <div>
                <h2>{currentGroup?.name}</h2>
                <p>{groupMembers.length} Members · {viewType} View</p>
              </div>
              <div className="matrix-controls">
                <div className="view-toggle">
                  <button className={matrixMode === "schedule" ? "active" : ""} onClick={() => setMatrixMode("schedule")}>By shift</button>
                  <button className={matrixMode === "volume" ? "active" : ""} onClick={() => setMatrixMode("volume")}><Icon name="sliders" size={13} />Volume plan</button>
                </div>
                {matrixMode === "schedule" && (
                  <div className="legend">
                    <span><i className="legend-good" />Scheduled</span>
                    <span><i className="legend-low" />Open</span>
                    <span><i className="legend-training" />Non-Productive</span>
                    <span><i className="legend-ot" />Overtime</span>
                    <span><i className="legend-premium" />Premium Pay</span>
                  </div>
                )}
              </div>
            </div>

            {matrixMode === "schedule" && (
              <div className="schedule-scroll">
                <table className="schedule-matrix">
                  <thead>
                    <tr className="week-band">
                      <th colSpan={2}>Shift and staff</th>
                      {Array.from({ length: Math.ceil(dates.length / 7) }, (_, wi) => (
                        <th key={wi} colSpan={Math.min(7, dates.length - wi * 7)}>Week {wi + 1}</th>
                      ))}
                    </tr>
                    <tr>
                      <th>Status</th>
                      <th>Team Member</th>
                      {dates.map((date) => (
                        <th key={formatDateISO(date)} className={isWeekend(date) ? "weekend" : ""}>
                          <strong>{dayNames[date.getDay()]}</strong>
                          <span>{formatDate(date)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {opsHours.map((hour) => {
                      const hourMembers = membersByStartHour.get(hour) || [];
                      const totalSlots = slotsForHour(hour);
                      const productiveCount = hourMembers.filter((m) => m.status === "Productive").length;
                      const openSlots = Math.max(0, totalSlots - productiveCount);

                      const isCollapsed = collapsedHours.has(hour);
                      return (
                        <Fragment key={hour}>
                          <tr className="shift-header-row" onClick={() => setCollapsedHours((prev) => { const next = new Set(prev); if (next.has(hour)) next.delete(hour); else next.add(hour); return next; })} style={{ cursor: "pointer" }} title={isCollapsed ? "Click to expand" : "Click to collapse"}>
                            <td className="shift-time-cell">
                              <span className="shift-collapse-icon"><Icon name={isCollapsed ? "chevronRight" : "chevronDown"} size={12} /></span>
                              <span className="shift-name">{formatHour24(hour)}</span>
                            </td>
                            <td className="shift-action-cell" onClick={(e) => e.stopPropagation()}>
                              <button className="shift-add-btn" onClick={() => {
                                updateSlotAdjustment(hour, 1);
                                setHasDraftChanges(true);
                                toast(`Added slot at ${formatHour24(hour)}`);
                              }}>
                                <Icon name="plus" size={11} />Add Slot
                              </button>
                            </td>
                            {dates.map((date) => (
                              <td key={formatDateISO(date)} className={isWeekend(date) ? "weekend" : ""} />
                            ))}
                          </tr>
                          {!isCollapsed && hourMembers.map((member) => {
                            const schedHrs = memberScheduledHours(member);
                            const otHrs = memberOvertimeHours(member);
                            const isOT = otHrs > 0;
                            return (
                              <tr key={member.id} className={`employee-row ${member.status !== "Productive" ? "nonproductive-row" : ""}`}>
                                <td>
                                  <select
                                    className={`status-select ${(member.status || "productive").toLowerCase()}`}
                                    value={member.status}
                                    onChange={async (e) => {
                                      await data.updateMember(member.id, { status: e.target.value as TeamMember["status"] });
                                      const m = await data.fetchAllMembers();
                                      setMembers(m);
                                      toast(`${member.name} marked as ${e.target.value}`);
                                    }}
                                  >
                                    <option>Productive</option>
                                    <option>Training</option>
                                    <option>Vacation</option>
                                  </select>
                                </td>
                                <td className="name-cell">
                                  <div className="name-cell-inner">
                                    <strong>{member.name}</strong>
                                    <span className={`employee-hours ${isOT ? "ot-warning" : ""}`}>{hoursLabel(schedHrs)} scheduled{isOT ? ` · ${otHrs}h OT` : ""}</span>
                                  </div>
                                  <button className="row-delete-btn" onClick={async () => {
                                    const dateISOs = dates.map((d) => formatDateISO(d));
                                    let hadShift = false;
                                    for (const dateISO of dateISOs) {
                                      const shift = getMemberShiftForDate(member.id, dateISO);
                                      if ((shift.status === "Scheduled" || shift.status === "Premium Pay") && shift.start && parseInt(shift.start.split(":")[0]) === hour) {
                                        await data.deleteShiftAssignment(member.id, dateISO);
                                        hadShift = true;
                                      }
                                    }
                                    setPendingRowMembers((prev) => {
                                      const next = new Map(prev);
                                      const list = next.get(hour);
                                      if (list) next.set(hour, list.filter((m) => m.id !== member.id));
                                      return next;
                                    });
                                    if (hadShift) {
                                      await data.logChange(`Removed ${member.name} from ${formatHour24(hour)} line in ${currentGroup?.name}`, "Matrix");
                                      const a = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
                                      setAssignments(a);
                                      setHasDraftChanges(true);
                                    }
                                    toast(`${member.name} removed from ${formatHour24(hour)}`);
                                  }} aria-label={`Remove ${member.name} from this hour`} title="Remove from this hour">&#x2715;</button>
                                </td>
                                {dates.map((date) => {
                                  const dateISO = formatDateISO(date);
                                  const shift = getMemberShiftForDate(member.id, dateISO);
                                  const cellLabel = formatShiftDisplay(shift.start, shift.end, shift.status);
                                  const cellClass = shift.status === "Off" ? "off" : shift.status === "PTO" || shift.status === "LOA" || shift.status === "Vacation" ? "leave" : shift.status === "Premium Pay" ? "premium-pay" : isOT ? "ot-cell" : "";
                                  return (
                                    <td key={dateISO} className={isWeekend(date) ? "weekend" : ""}>
                                      <button
                                        className={`shift-cell ${cellClass}`}
                                        onClick={() => openEditor(member, date, hour)}
                                      >
                                        <span>{cellLabel}</span>
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                          {!isCollapsed && Array.from({ length: openSlots }, (_, i) => (
                            <tr key={`open-${hour}-${i}`} className="open-slot-row">
                              <td className="open-slot-status-cell">
                                <span className="open-slot-badge">Open</span>
                                <button className="row-delete-btn open-slot-delete-btn" onClick={() => {
                                  updateSlotAdjustment(hour, -1);
                                  setHasDraftChanges(true);
                                  toast(`Removed open slot at ${formatHour24(hour)}`);
                                }} aria-label="Remove open slot" title="Remove open slot">&#x2715;</button>
                              </td>
                              <td className="name-cell open-slot-name-cell">
                                <button className="assign-slot-btn" onClick={() => { setAssignPanel({ hour, dateISO: null }); setAssignSearch(""); setBorrowMode(false); }}>
                                  <Icon name="plus" size={13} />Assign employee
                                </button>
                              </td>
                              {dates.map((date) => {
                                const dateISO = formatDateISO(date);
                                return (
                                  <td key={dateISO} className={`open-slot-day ${isWeekend(date) ? "weekend" : ""}`}>
                                    <button className="shift-cell open-slot-shift" onClick={() => { setAssignPanel({ hour, dateISO }); setAssignSearch(""); setBorrowMode(false); }}>
                                      <span>{`${formatHour24(hour)}-${slotEndForHour(hour)}`}</span>
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {/* Subtotal row — always visible */}
                          <tr className={`shift-subtotal-row ${isCollapsed ? "collapsed" : ""}`}>
                            <td colSpan={2} className="shift-subtotal-label">Staff at {formatHour24(hour)}</td>
                            {dates.map((date) => {
                              const working = staffAtHour(hour, date);
                              const needed = neededAt(hour, isWeekend(date));
                              const cls = working === 0 ? "zero" : working < needed ? "partial" : "full";
                              return (
                                <td key={formatDateISO(date)} className={`shift-subtotal-cell ${isWeekend(date) ? "weekend" : ""} ${cls}`}>
                                  <strong>{working}</strong>
                                  <span>/{needed}</span>
                                </td>
                              );
                            })}
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {matrixMode === "volume" && (
              <div className="volume-plan-wrap">
                <div className="volume-settings-bar">
                  <div className="volume-setting">
                    <label className="checkbox-label">
                      <input type="checkbox" checked={vpEnabled} onChange={(e) => setVpEnabled(e.target.checked)} />
                      <span>Volume plan enabled?</span>
                    </label>
                  </div>
                </div>

                {vpEnabled && (
                  <>
                    <div className="volume-settings-bar" style={{ marginTop: "8px" }}>
                      <div className="volume-setting">
                        <div>
                          <span className="vs-label">Hours of operation</span>
                          <span className="vs-hint">Determines which hours appear in the By Shift grid</span>
                        </div>
                        <div className="ops-time-pair">
                          <div className="ops-time-field">
                            <label className="ops-time-label">Start</label>
                            <input type="time" value={vpStart} onChange={(e) => setVpStart(e.target.value)} className="time-input" />
                          </div>
                          <span className="ops-time-sep">to</span>
                          <div className="ops-time-field">
                            <label className="ops-time-label">End</label>
                            <input type="time" value={vpEnd} onChange={(e) => setVpEnd(e.target.value)} className="time-input" />
                          </div>
                        </div>
                      </div>
                      <div className="vs-divider" />
                      <div className="volume-setting">
                        <label>
                          <span className="vs-label">Jobs per productive hour</span>
                          <span className="vs-hint">Used to calculate staff needed from volume</span>
                        </label>
                        <input type="number" min="0" step="0.5" value={vpRate} onChange={(e) => setVpRate(Number(e.target.value) || 0)} className="rate-input" />
                      </div>
                      <div className="vs-divider" />
                      <div className="volume-setting">
                        <label>
                          <span className="vs-label">Weekend multiplier</span>
                          <span className="vs-hint">Percentage of weekday volume (e.g. 0.65 = 65%)</span>
                        </label>
                        <input type="number" min="0" max="1" step="0.05" value={vpWeekendMult} onChange={(e) => setVpWeekendMult(Number(e.target.value) || 0)} className="rate-input" />
                      </div>
                    </div>

                    <div className="volume-table-scroll">
                      <table className="volume-table">
                        <thead>
                          <tr>
                            <th>Hour</th>
                            <th>Expected Volume<span>Weekday</span></th>
                            <th>Staff Needed<span>Weekday</span></th>
                            <th>Expected Volume<span>Weekend ({Math.round(vpWeekendMult * 100)}%)</span></th>
                            <th>Staff Needed<span>Weekend</span></th>
                            <th>Volume Bar <span className="vt-bar-legend"><i className="vt-legend-vol" />Volume <i className="vt-legend-staff" />Staff Scheduled</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const startH = parseInt(vpStart.split(":")[0]);
                            const endH = parseInt(vpEnd.split(":")[0]);
                            const hours: number[] = [];
                            for (let h = startH; h <= endH; h++) hours.push(h);
                            const maxVol = Math.max(...vpVolume, 1);
                            return hours.map((hour) => {
                              const vol = vpVolume[hour] || 0;
                              const wdNeed = neededAt(hour, false);
                              const weVol = Math.round(vol * vpWeekendMult);
                              const weNeed = neededAt(hour, true);
                              return (
                                <tr key={hour}>
                                  <td className="vt-hour">{hourLabel(hour)}</td>
                                  <td className="vt-input-cell">
                                    <input type="number" min="0" value={vol} onChange={(e) => { const v = [...vpVolume]; v[hour] = Number(e.target.value) || 0; setVpVolume(v); }} className="volume-input" />
                                  </td>
                                  <td className="vt-need">{wdNeed}</td>
                                  <td className="vt-we-vol">{weVol}</td>
                                  <td className="vt-need">{weNeed}</td>
                                  <td className="vt-bar-cell">
                                    <div className="vt-bar-track">
                                      <div className="vt-bar-scheduled" style={{ width: `${Math.min(100, Math.round((staffAtHour(hour, dates[0]) / Math.max(maxVol, 1)) * 100))}%` }} />
                                      <div className="vt-bar-fill" style={{ width: `${Math.round(vol / maxVol * 100)}%` }} />
                                    </div>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                    {vpRate === 0 && (
                      <div className="manual-staff-section">
                        <h4>Manual staff count per hour</h4>
                        <p>Since productivity rate is blank, enter staff needed for each hour:</p>
                        <div className="manual-staff-grid">
                          {(() => {
                            const startH = parseInt(vpStart.split(":")[0]);
                            const endH = parseInt(vpEnd.split(":")[0]);
                            const hours: number[] = [];
                            for (let h = startH; h <= endH; h++) hours.push(h);
                            return hours.map((hour) => (
                              <label key={hour} className="manual-staff-item">
                                <span>{hourLabel(hour)}</span>
                                <input type="number" min="0" value={vpManualStaff[hour] || 0} onChange={(e) => { const v = [...vpManualStaff]; v[hour] = Number(e.target.value) || 0; setVpManualStaff(v); }} className="volume-input" />
                              </label>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!vpEnabled && (
                  <div className="vp-disabled-info">
                    <Icon name="sliders" size={24} />
                    <h4>Volume Plan Is Disabled</h4>
                    <p>The Staffing Matrix Will Default To The Hours Of Service From The Group Assignment. Each Hour Defaults To One Staff Member. Enable Volume Planning To Automatically Calculate Staffing Needs From Expected Demand.</p>
                  </div>
                )}

                <div className="matrix-footer">
                  <span>Changes To The Volume Plan Update The By Shift Grid In Real Time</span>
                  <Button variant="primary" icon="save" onClick={saveVolumePlan}>Save volume plan</Button>
                </div>
              </div>
            )}
          </section>

        </>
      )}

      {/* Shift Editor Modal */}
      {editorOpen && editingMember && (
        <Modal
          title="Edit Assignment"
          subtitle={editingMember.name}
          onClose={() => setEditorOpen(false)}
          footer={
            <>
              <button className="btn-remove-shift" onClick={removeShift}>Remove Shift</button>
              <div className="modal-actions-right">
                <Button onClick={() => setEditorOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={saveShift}>Save Assignment</Button>
              </div>
            </>
          }
        >
          <label>Date
            <div className="editor-date-display">{editingDate}</div>
          </label>
          <label>Status
            <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as ShiftStatus)}>
              <option value="Scheduled">Scheduled</option>
              <option value="Premium Pay">Premium Pay</option>
              <option value="Off">Off</option>
              <option value="PTO">PTO</option>
              <option value="LOA">LOA</option>
              <option value="Vacation">Vacation</option>
            </select>
          </label>
          {(editStatus === "Scheduled" || editStatus === "Premium Pay") && (
            <label>Shift Time
              <div className="shift-time-inputs">
                <div className="shift-time-field"><span>Start</span><input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} /></div>
                <span className="shift-time-sep">→</span>
                <div className="shift-time-field"><span>End</span><input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} /></div>
              </div>
            </label>
          )}
          {editStatus === "Premium Pay" && (
            <div className="premium-pay-fields">
              <label>Premium Pay Type
                <select value={editPremiumType} onChange={(e) => setEditPremiumType(e.target.value as PremiumPayType | "")}>
                  <option value="">Select type...</option>
                  <option value="base_plus">Base rate + amount</option>
                  <option value="rate_plus_percent">Base rate + %</option>
                  <option value="other">Other (custom hourly rate)</option>
                </select>
              </label>
              {editPremiumType === "base_plus" && (
                <label>Additional Amount ($/Hr)
                  <input type="number" min="0" step="0.01" value={editPremiumAmount} onChange={(e) => setEditPremiumAmount(Number(e.target.value) || 0)} />
                </label>
              )}
              {editPremiumType === "rate_plus_percent" && (
                <label>Percentage Added (%)
                  <input type="number" min="0" step="1" value={editPremiumAmount} onChange={(e) => setEditPremiumAmount(Number(e.target.value) || 0)} />
                </label>
              )}
              {editPremiumType === "other" && (
                <label>Custom Hourly Rate ($)
                  <input type="number" min="0" step="0.01" value={editPremiumAmount} onChange={(e) => setEditPremiumAmount(Number(e.target.value) || 0)} />
                </label>
              )}
              {editPremiumType && (
                <p className="modal-hint">Effective rate: ${effectiveRate(getMemberAssignment(editingMember.id, editingDate), editingMember).toFixed(2)}/hr</p>
              )}
            </div>
          )}
          {(editStatus === "Scheduled" || editStatus === "Premium Pay") && (
            <label>Also Apply To Other Days In This Period
              <div className="mini-cal">
                {dates.map((date) => {
                  const dateISO = formatDateISO(date);
                  const shift = getMemberShiftForDate(editingMember.id, dateISO);
                  const hasShift = (shift.status === "Scheduled" || shift.status === "Premium Pay") && shift.start;
                  const isSelected = editMultiDays.has(dateISO) || dateISO === editingDate;
                  return (
                    <div
                      key={dateISO}
                      className={`mini-cal-day ${hasShift ? "has-shift" : ""} ${isSelected ? "selected" : ""} ${isWeekend(date) ? "weekend" : ""}`}
                      onClick={() => {
                        if (dateISO === editingDate) return;
                        setEditMultiDays((prev) => {
                          const next = new Set(prev);
                          if (next.has(dateISO)) next.delete(dateISO);
                          else next.add(dateISO);
                          return next;
                        });
                      }}
                    >
                      <strong>{dayNames[date.getDay()]}</strong>
                      <small>{formatDate(date)}</small>
                    </div>
                  );
                })}
              </div>
            </label>
          )}
        </Modal>
      )}

      {/* Conflict Resolution Modal */}
      {conflict && (
        <Modal
          title="Assignment Conflict"
          subtitle="This Employee Already Has A Shift Scheduled"
          onClose={() => { setConflict(null); }}
        >
          <div className="conflict-message">
            <Icon name="alert" size={24} />
            <p>{conflict.message}</p>
          </div>
          <div className="conflict-actions">
            <Button onClick={conflict.onIgnore}>Ignore</Button>
            <Button variant="primary" onClick={conflict.onReplace}>Replace Existing</Button>
          </div>
        </Modal>
      )}

      {/* Assign Panel */}
      {assignPanel && (
        <div className="assign-overlay" onClick={() => setAssignPanel(null)}>
          <div className="assign-panel" onClick={(e) => e.stopPropagation()}>
            <div className="assign-panel-header">
              <div>
                <h3>Assign Employee</h3>
                <p>{assignPanel.dateISO ? `${formatHour24(assignPanel.hour)} shift on ${assignPanel.dateISO}` : `${formatHour24(assignPanel.hour)} row — click a date after assigning to schedule`}</p>
              </div>
              <button className="assign-close" onClick={() => setAssignPanel(null)}><Icon name="x" size={16} /></button>
            </div>
            <div className="assign-toggle-row">
              <button className={`assign-toggle-btn ${!borrowMode ? "active" : ""}`} onClick={() => setBorrowMode(false)}>From this group</button>
              <button className={`assign-toggle-btn ${borrowMode ? "active" : ""}`} onClick={() => setBorrowMode(true)}>Borrow from another group</button>
            </div>
            <input
              className="assign-search-input"
              placeholder="Search by name..."
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              autoFocus
            />
            <ul className="assign-list">
              {availableToAssign
                .filter((p) => p.name.toLowerCase().includes(assignSearch.toLowerCase()))
                .map((member) => {
                  const initials = member.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                  const memberGroup = groups.find((g) => g.id === member.group_id);
                  return (
                    <li key={member.id}>
                      <button className="assign-list-item" onClick={() => assignPanel.dateISO ? assignToOpenSlot(member, assignPanel.hour, assignPanel.dateISO) : assignToRow(member, assignPanel.hour)}>
                        <div className="assign-avatar">{initials}</div>
                        <div>
                          <strong>{member.name}</strong>
                          <span>{memberGroup?.name}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              {availableToAssign.filter((p) => p.name.toLowerCase().includes(assignSearch.toLowerCase())).length === 0 && (
                <li className="assign-empty">No matching employees found.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Copy Schedule Confirmation */}
      {showCopyPrompt && (
        <Modal
          title="Copy Schedule From Previous Period"
          subtitle={`Copy all shifts from the previous ${viewType} period into this one, matching by day of week.`}
          onClose={() => setShowCopyPrompt(false)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setShowCopyPrompt(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleCopyFromPrevious}>Copy Shifts</Button>
              </div>
            </>
          }
        >
          <p className="modal-hint">This will create new shifts in the current period based on the previous period's assignments. Existing shifts will be overwritten for matching days. This only affects {currentGroup?.name}.</p>
        </Modal>
      )}

      {/* FTE Budget Modal */}
      {editingFte && (
        <Modal
          title="Set FTE Budget"
          subtitle={`For ${currentGroup?.name}`}
          onClose={() => setEditingFte(false)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setEditingFte(false)}>Cancel</Button>
                <Button variant="primary" onClick={saveFteBudget}>Save Budget</Button>
              </div>
            </>
          }
        >
          <label>Budgeted FTEs
            <input type="number" min="0" step="0.1" value={fteInput} onChange={(e) => setFteInput(e.target.value)} autoFocus />
          </label>
          <p className="modal-hint">The scheduled FTE count will be compared against this budget. Variances below 95% or above 105% will be highlighted.</p>
        </Modal>
      )}

      {/* All Groups Budget Modal */}
      {editingAllGroupsBudget && (
        <Modal
          title="Set All Groups FTE Budget"
          subtitle="Budgeted FTE target across all groups"
          onClose={() => setEditingAllGroupsBudget(false)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setEditingAllGroupsBudget(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => {
                  const val = Number(allGroupsBudgetInput) || 0;
                  setAllGroupsBudget(val);
                  if (typeof localStorage !== "undefined") localStorage.setItem("allGroupsBudgetFte", String(val));
                  setEditingAllGroupsBudget(false);
                  toast("All Groups FTE budget saved");
                }}>Save Budget</Button>
              </div>
            </>
          }
        >
          <label>Budgeted FTEs (All Groups)
            <input type="number" min="0" step="0.1" value={allGroupsBudgetInput} onChange={(e) => setAllGroupsBudgetInput(e.target.value)} autoFocus />
          </label>
          <p className="modal-hint">The total scheduled FTE across all groups will be compared against this budget. Variances below 95% or above 105% will be highlighted.</p>
        </Modal>
      )}
    </div>
  );
}
