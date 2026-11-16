import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Fragment } from "react";
import type { AssignmentGroup, TeamMember, ShiftAssignment, VolumePlan, FteBudget, PublishedState, ViewType, MatrixMode, ShiftStatus, PremiumPayType, CompanyHoliday, VolumeDataPoint, ScheduleTemplate } from "../lib/types";
import * as data from "../lib/data";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { Icon, Button, Modal } from "./ui";
import { parseFile, readFileToSheets, computeVolumeRecommendation } from "../lib/volumeImport";
import {
  GROUP_COLORS, getDateRange, formatDateRange, formatDateISO, addDays,
  dayNames, isWeekend, generateHourLabels, hourLabel, formatHour24, slotEndForHour,
  inputTimeValue, shiftDuration, isActiveAt, formatShiftDisplay, hoursLabel,
  formatDate,
} from "../lib/helpers";
interface ToastFn { (msg: string): void; }

interface SharedDateProps {
  viewType: ViewType;
  setViewType: (v: ViewType) => void;
  rangeStart: Date;
  setRangeStart: (d: Date) => void;
  payPeriodStart: string;
  setPayPeriodStart: (s: string) => void;
}

export default function MatrixTab({ toast, viewType, setViewType, rangeStart, setRangeStart, payPeriodStart, setPayPeriodStart }: { toast: ToastFn } & SharedDateProps) {
  const { canEdit } = useAuth();
  const isAdmin = canEdit;
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [allAssignments, setAllAssignments] = useState<ShiftAssignment[]>([]);
  const [volumePlans, setVolumePlans] = useState<Record<string, VolumePlan>>({});
  const [fteBudgets, setFteBudgets] = useState<Record<string, FteBudget>>({});
  const [publishedStates, setPublishedStates] = useState<Record<string, PublishedState>>({});
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [matrixMode, setMatrixMode] = useState<MatrixMode>("schedule");

  // Per-assignment include-as-non-prod flag in the editor
  const [editIncludeNonProd, setEditIncludeNonProd] = useState<boolean>(false);
  // Per-assignment lunch break override (in hours)
  const [editLunchBreak, setEditLunchBreak] = useState<number | null>(null);

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

  // Template state
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templatePeriod, setTemplatePeriod] = useState<"current" | "7" | "14" | "30" | "custom">("current");
  const [templateCustomDays, setTemplateCustomDays] = useState<number>(14);
  const [templateNameError, setTemplateNameError] = useState<string>("");
  const [pendingReplaceTemplate, setPendingReplaceTemplate] = useState<ScheduleTemplate | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [templatesBusy, setTemplatesBusy] = useState(false);

  // Confirmation dialogs
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

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
  const [vpAutoVolume, setVpAutoVolume] = useState(true);
  const [vpAutoWeekend, setVpAutoWeekend] = useState(true);

  // Volume data import state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string>("");
  const [importError, setImportError] = useState("");
  const [lastImportInfo, setLastImportInfo] = useState<string>("");
  const [dataPointCount, setDataPointCount] = useState(0);
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

  const [customEndISO, setCustomEndISO] = useState<string>("");
  const customDays = customEndISO
    ? Math.max(1, Math.round((new Date(customEndISO + "T00:00:00").getTime() - rangeStart.getTime()) / 86400000) + 1)
    : 2;
  const dates = useMemo(() => getDateRange(viewType, rangeStart, customDays), [viewType, rangeStart, customDays]);
  const rangeEnd = dates[dates.length - 1];

  const loadAll = useCallback(async () => {
    try {
      const [g, m, holidays] = await Promise.all([data.fetchGroups(), data.fetchAllMembers(), data.fetchCompanyHolidays()]);
      setGroups(g);
      setMembers(m);
      setHolidays(holidays);
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
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Holiday lookup by ISO date for the By Shift grid header/cells
  const holidayByDate: Record<string, CompanyHoliday> = Object.fromEntries(
    holidays.map((h) => [h.holiday_date, h])
  );

  // Snap rangeStart to the start of the current pay period whenever payPeriodStart changes
  // (skipped in custom mode so a hand-picked range isn't snapped away)
  useEffect(() => {
    if (viewType === "custom") return;
    const ppStart = new Date(payPeriodStart + "T00:00:00");
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - ppStart.getTime()) / (1000 * 60 * 60 * 24));
    const periodsElapsed = Math.floor(diffDays / 14);
    const currentPeriodStart = addDays(ppStart, periodsElapsed * 14);
    setRangeStart(currentPeriodStart);
  }, [payPeriodStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigate by full pay periods (14 days for bi-weekly, 7 for weekly/daily, 30 for monthly, custom length for custom)
  const navigatePeriod = (direction: number) => {
    const step = viewType === "bi-weekly" ? 14 : viewType === "monthly" ? 30 : viewType === "daily" ? 1 : viewType === "custom" ? customDays : 7;
    const delta = step * direction;
    setRangeStart(addDays(rangeStart, delta));
    if (viewType === "custom") {
      const baseEnd = customEndISO ? new Date(customEndISO + "T00:00:00") : addDays(rangeStart, 1);
      setCustomEndISO(formatDateISO(addDays(baseEnd, delta)));
    }
  };

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
        const a = await refreshAssignments();
        setHasDraftChanges(a.some((x) => !x.is_published));
      } catch (e) { setError(String(e)); }
    })();
  }, [selectedGroup, rangeStart, viewType, customDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload all-groups assignments when date range changes (independent of selected group)
  useEffect(() => {
    (async () => {
      try {
        const allA = await data.fetchAllAssignmentsInRange(dates[0], rangeEnd);
        setAllAssignments(allA);
      } catch (e) { setError(String(e)); }
    })();
  }, [rangeStart, viewType, customDays]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Reset auto-calc flags per group (localStorage remembers overrides per group)
    if (typeof localStorage !== "undefined") {
      setVpAutoVolume(localStorage.getItem(`vpAutoVolume_${selectedGroup}`) !== "false");
      setVpAutoWeekend(localStorage.getItem(`vpAutoWeekend_${selectedGroup}`) !== "false");
    } else {
      setVpAutoVolume(true);
      setVpAutoWeekend(true);
    }
  }, [selectedGroup, volumePlans, groups]);

  // Recompute automatic volume whenever imported data or hours of operation change
  const volumeDataPointsRef = useRef<VolumeDataPoint[]>([]);
  useEffect(() => {
    if (!selectedGroup) return;
    (async () => {
      try {
        const pts = await data.fetchVolumeDataPoints(selectedGroup);
        volumeDataPointsRef.current = pts;
        setDataPointCount(pts.length);
        if (pts.length > 0) {
          const rec = computeVolumeRecommendation(
            pts,
            parseInt(vpStart.split(":")[0]),
            parseInt(vpEnd.split(":")[0])
          );
          const first = pts[0];
          const last = pts[pts.length - 1];
          setLastImportInfo(`${pts.length.toLocaleString()} data points from ${first.event_date} to ${last.event_date}`);
          if (vpAutoVolume) setVpVolume(rec.hourlyVolume);
          if (vpAutoWeekend) setVpWeekendMult(rec.weekendMultiplier);
        }
      } catch (e) { setError(String(e)); }
    })();
  }, [selectedGroup, vpAutoVolume, vpAutoWeekend, vpStart, vpEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load templates whenever the selected group changes (admin/editor only)
  useEffect(() => {
    if (!selectedGroup || !isAdmin) { setTemplates([]); return; }
    (async () => {
      try {
        const t = await data.fetchTemplates(selectedGroup);
        setTemplates(t);
      } catch (e) { setError(String(e)); }
    })();
  }, [selectedGroup, isAdmin]);

  const currentGroup = groups.find((g) => g.id === selectedGroup);
  const groupMembers = members.filter((m) => m.group_id === selectedGroup);

  const opsHours = useMemo(() => {
    const start = vpEnabled ? vpStart : (currentGroup?.hours_of_service_start || "06:00");
    const end = vpEnabled ? vpEnd : (currentGroup?.hours_of_service_end || "22:00");
    return generateHourLabels(start, end);
  }, [vpEnabled, vpStart, vpEnd, currentGroup]);

  const refreshAssignments = async () => {
    const [groupA, allA] = await Promise.all([
      data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd),
      data.fetchAllAssignmentsInRange(dates[0], rangeEnd),
    ]);
    setAssignments(groupA);
    setAllAssignments(allA);
    return groupA;
  };

  const getMemberAssignment = (memberId: string, dateISO: string): ShiftAssignment | undefined => {
    return assignments.find((a) => a.member_id === memberId && a.assignment_date === dateISO);
  };

  const getMemberShiftForDate = (memberId: string, dateISO: string): { start: string | null; end: string | null; status: ShiftStatus } => {
    const a = getMemberAssignment(memberId, dateISO);
    if (a) return { start: a.shift_start, end: a.shift_end, status: a.status };
    return { start: null, end: null, status: "Off" };
  };

  // Check if a shift counts as hours (scheduled/premium = productive; PTO/LOA/Vacation/Training count only when the user opted in)
  const NON_PROD_STATUSES: ShiftStatus[] = ["PTO", "LOA", "Vacation", "Training"];
  const shiftCountsAsHours = (status: ShiftStatus, assignment?: ShiftAssignment): boolean => {
    if (status === "Scheduled" || status === "Premium Pay") return true;
    if (assignment?.include_as_non_prod && NON_PROD_STATUSES.includes(status)) return true;
    return false;
  };
  const isNonProdShift = (status: ShiftStatus, assignment?: ShiftAssignment): boolean =>
    !!assignment?.include_as_non_prod && NON_PROD_STATUSES.includes(status);

  // Statuses whose editor shows shift times (everything except Off)
  const hasShiftTimes = (status: ShiftStatus): boolean => status !== "Off";

  // Calculate scheduled hours for a member across all dates (excluding unpaid breaks)
  const memberScheduledHours = (member: TeamMember): number => {
    let total = 0;
    for (const date of dates) {
      const dateISO = formatDateISO(date);
      const a = getMemberAssignment(member.id, dateISO);
      const shift = getMemberShiftForDate(member.id, dateISO);
      if (shiftCountsAsHours(shift.status, a) && shift.start && shift.end) {
        const dur = shiftDuration(shift.start, shift.end);
        const breakMins = a?.shift_override_break != null ? a.shift_override_break : member.daily_unpaid_break;
        total += Math.max(0, dur - breakMins);
      }
    }
    return Math.round(total * 10) / 10;
  };

  // Calculate scheduled hours for a member across a specific set of dates
  const memberHoursForDates = (member: TeamMember, dateList: Date[]): number => {
    let total = 0;
    for (const date of dateList) {
      const dateISO = formatDateISO(date);
      const a = getMemberAssignment(member.id, dateISO);
      const shift = getMemberShiftForDate(member.id, dateISO);
      if (shiftCountsAsHours(shift.status, a) && shift.start && shift.end) {
        const dur = shiftDuration(shift.start, shift.end);
        const breakMins = a?.shift_override_break != null ? a.shift_override_break : member.daily_unpaid_break;
        total += Math.max(0, dur - breakMins);
      }
    }
    return Math.round(total * 10) / 10;
  };

  // For daily view, expand to the full week aligned to pay period
  const effectiveDates = useMemo((): Date[] => {
    if (viewType === "daily" && dates.length === 1) {
      const ppStart = new Date(payPeriodStart + "T00:00:00");
      const daysFromPayStart = Math.floor((dates[0].getTime() - ppStart.getTime()) / (1000 * 60 * 60 * 24));
      const weekStartOffset = Math.floor(daysFromPayStart / 7) * 7;
      const weekStart = addDays(ppStart, weekStartOffset);
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    }
    return dates;
  }, [dates, viewType, payPeriodStart]);

  const numWeeks = Math.max(1, Math.ceil(effectiveDates.length / 7));

  // Calculate weekly hours for OT detection
  const memberWeeklyHours = (member: TeamMember, weekIndex: number): number => {
    const weekDates = dates.slice(weekIndex * 7, (weekIndex + 1) * 7);
    let total = 0;
    for (const date of weekDates) {
      const dateISO = formatDateISO(date);
      const shift = getMemberShiftForDate(member.id, dateISO);
      if ((shift.status === "Scheduled" || shift.status === "Premium Pay") && shift.start && shift.end) {
        const a = getMemberAssignment(member.id, dateISO);
        const dur = shiftDuration(shift.start, shift.end);
        const breakMins = a?.shift_override_break != null ? a.shift_override_break : member.daily_unpaid_break;
        total += Math.max(0, dur - breakMins);
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
            const dur = Math.max(0, shiftDuration(shift.start, shift.end) - (a?.shift_override_break != null ? a.shift_override_break : member.daily_unpaid_break));
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

  // Cross-group totals — total hours across ALL teams, divided by weeks in the period
  const allGroupsFte = useMemo(() => {
    let totalProductiveHours = 0;
    let totalNonProdHours = 0;
    for (const date of effectiveDates) {
      const dateISO = formatDateISO(date);
      for (const m of members) {
        const a = allAssignments.find((x) => x.member_id === m.id && x.assignment_date === dateISO);
        if (!a) continue;
        const status = a.status;
        if (!shiftCountsAsHours(status, a)) continue;
        if (!a.shift_start || !a.shift_end) continue;
        const dur = shiftDuration(a.shift_start, a.shift_end);
        const breakMins = a.shift_override_break != null ? a.shift_override_break : m.daily_unpaid_break;
        const paidHrs = Math.max(0, dur - breakMins);
        if (isNonProdShift(status, a)) totalNonProdHours += paidHrs;
        else totalProductiveHours += paidHrs;
      }
    }
    const weeklyProductive = Math.round((totalProductiveHours / numWeeks) * 10) / 10;
    const weeklyNonProd = Math.round((totalNonProdHours / numWeeks) * 10) / 10;
    const weeklyHours = Math.round((weeklyProductive + weeklyNonProd) * 10) / 10;
    const weeklyFTE = Math.round((weeklyHours / 40) * 100) / 100;
    return {
      totalProductive: weeklyProductive,
      totalNonProductive: weeklyNonProd,
      totalFTE: weeklyFTE,
      totalHours: weeklyHours,
      totalLaborSpend: 0,
    };
  }, [members, allAssignments, effectiveDates, numWeeks]);

  // FTE calculations with productive/non-productive split (weekly averages)
  const fteCalculations = useMemo(() => {
    const weeks: Date[][] = [];
    for (let w = 0; w < numWeeks; w++) {
      weeks.push(effectiveDates.slice(w * 7, Math.min((w + 1) * 7, effectiveDates.length)));
    }
    const calcWeekHours = (weekDates: Date[], productiveOnly: boolean) => {
      let total = 0;
      for (const member of groupMembers) {
        for (const date of weekDates) {
          const dateISO = formatDateISO(date);
          const a = getMemberAssignment(member.id, dateISO);
          const shift = getMemberShiftForDate(member.id, dateISO);
          if (!shiftCountsAsHours(shift.status, a) || !shift.start || !shift.end) continue;
          const productive = !isNonProdShift(shift.status, a);
          if (productiveOnly !== productive) continue;
          const dur = shiftDuration(shift.start, shift.end);
          const breakMins = a?.shift_override_break != null ? a.shift_override_break : member.daily_unpaid_break;
          total += Math.max(0, dur - breakMins);
        }
      }
      return Math.round(total * 10) / 10;
    };
    const weekProductive = weeks.map((w) => calcWeekHours(w, true));
    const weekNonProd = weeks.map((w) => calcWeekHours(w, false));
    const totalProductiveAllWeeks = weekProductive.reduce((a, b) => a + b, 0);
    const totalNonProdAllWeeks = weekNonProd.reduce((a, b) => a + b, 0);
    const avgProductive = Math.round((totalProductiveAllWeeks / numWeeks) * 10) / 10;
    const avgNonProd = Math.round((totalNonProdAllWeeks / numWeeks) * 10) / 10;
    const totalHours = Math.round((avgProductive + avgNonProd) * 10) / 10;
    const totalFTE = Math.round((totalHours / 40) * 100) / 100;
    const budget = fteBudgets[selectedGroup]?.budgeted_fte || 0;
    const fteVariance = budget > 0 ? Math.round((totalFTE / budget) * 100) : 0;
    const fteClass = budget > 0
      ? (fteVariance < 95 || fteVariance > 105 ? "fte-out-of-range" : fteVariance > 100 ? "fte-warning" : "fte-in-range")
      : "";
    const fteOutOfRange = budget > 0 && (fteVariance < 95 || fteVariance > 105);
    return { week1Productive: weekProductive[0] || 0, week2Productive: weekProductive[1] || 0, week1NonProd: weekNonProd[0] || 0, week2NonProd: weekNonProd[1] || 0, totalProductive: avgProductive, totalNonProd: avgNonProd, totalHours, totalFTE, budget, fteVariance, fteOutOfRange, fteClass };
  }, [groupMembers, assignments, effectiveDates, numWeeks, selectedGroup, fteBudgets]);

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
    return Math.max(0, (slotAdjustments[hour] || 0));
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
      setEditIncludeNonProd(false);
      setEditLunchBreak(a?.shift_override_break != null ? a.shift_override_break : null);
    } else if (shift.status !== "Scheduled" && shift.status !== "Off" && shift.status !== "Premium Pay") {
      setEditStart(shift.start || `${String(hour).padStart(2, "0")}:00`);
      setEditEnd(shift.end || slotEndForHour(hour));
      setEditStatus(shift.status);
      setEditPremiumType("");
      setEditPremiumAmount(0);
      const a = getMemberAssignment(member.id, dateISO);
      setEditIncludeNonProd(a?.include_as_non_prod || false);
      setEditLunchBreak(null);
    } else {
      setEditStart(`${String(hour).padStart(2, "0")}:00`);
      setEditEnd(slotEndForHour(hour));
      setEditStatus("Scheduled");
      setEditPremiumType("");
      setEditPremiumAmount(0);
      setEditIncludeNonProd(false);
      setEditLunchBreak(null);
    }
    setEditorOpen(true);
  };

  const saveShift = async () => {
    if (!editingMember) return;
    const status: ShiftStatus = editStatus;
    const isPremium = status === "Premium Pay";
    const hasTimes = status !== "Off";
    const shiftStart = hasTimes ? editStart : null;
    const shiftEnd = hasTimes ? editEnd : null;
    const premiumType = isPremium && editPremiumType ? editPremiumType : null;
    const premiumAmt = isPremium && editPremiumType ? editPremiumAmount : null;
    const includeNonProd = (status === "PTO" || status === "LOA" || status === "Vacation" || status === "Training") && editIncludeNonProd;

    const datesToSave = [editingDate, ...Array.from(editMultiDays).filter((d) => d !== editingDate)];

    // Capture prior state for undo
    const priorAssignments: { dateISO: string; data: ShiftAssignment | null }[] = [];
    for (const dateISO of datesToSave) {
      priorAssignments.push({ dateISO, data: getMemberAssignment(editingMember.id, dateISO) || null });
    }

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
          include_as_non_prod: includeNonProd,
          shift_override_break: (editStatus === "Scheduled" || editStatus === "Premium Pay") ? editLunchBreak : null,
        });
      }
      await data.logChange(`Updated ${editingMember.name}'s shift on ${editingDate} in ${currentGroup?.name}${datesToSave.length > 1 ? ` (${datesToSave.length} days)` : ""}`, "Matrix");
      const a = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
      setAssignments(a);
      setHasDraftChanges(true);
      // Push undo entry
      setUndoStack((prev) => [...prev, {
        description: `Edit ${editingMember.name} on ${datesToSave.length > 1 ? `${datesToSave.length} days` : editingDate}`,
        action: async () => {
          for (const prior of priorAssignments) {
            if (prior.data) {
              await data.upsertShiftAssignment({
                member_id: prior.data.member_id,
                group_id: prior.data.group_id,
                assignment_date: prior.dateISO,
                shift_start: prior.data.shift_start,
                shift_end: prior.data.shift_end,
                status: prior.data.status,
                is_published: prior.data.is_published,
                borrowed_from_group_id: prior.data.borrowed_from_group_id,
                premium_pay_type: prior.data.premium_pay_type as any,
                premium_pay_amount: prior.data.premium_pay_amount as any,
                include_as_non_prod: prior.data.include_as_non_prod || false,
                shift_override_break: prior.data.shift_override_break ?? null,
              });
            } else {
              await data.deleteShiftAssignment(editingMember.id, prior.dateISO);
            }
          }
        },
      }]);
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
    const prior = getMemberAssignment(editingMember.id, editingDate);
    await data.deleteShiftAssignment(editingMember.id, editingDate);
    await data.logChange(`Removed ${editingMember.name}'s shift on ${editingDate}`, "Matrix");
    const a = await refreshAssignments();
    setHasDraftChanges(true);
    if (prior) {
      setUndoStack((prev) => [...prev, {
        description: `Remove ${editingMember.name} on ${editingDate}`,
        action: async () => {
          await data.upsertShiftAssignment({
            member_id: prior.member_id,
            group_id: prior.group_id,
            assignment_date: prior.assignment_date,
            shift_start: prior.shift_start,
            shift_end: prior.shift_end,
            status: prior.status,
            is_published: prior.is_published,
            borrowed_from_group_id: prior.borrowed_from_group_id,
            premium_pay_type: prior.premium_pay_type as any,
            premium_pay_amount: prior.premium_pay_amount as any,
            include_as_non_prod: prior.include_as_non_prod || false,
            shift_override_break: prior.shift_override_break ?? null,
          });
        },
      }]);
    }
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
    if (!canEdit) return;
    // Draft assignments are already saved to DB; just log it
    await data.logChange(`Saved draft for ${currentGroup?.name}`, "Save Draft");
    toast("Draft saved");
  };

  const handlePublish = async () => {
    if (!currentGroup || !canEdit) return;
    await data.publishSchedule(selectedGroup, currentGroup.name, dates[0], rangeEnd);
    if (typeof localStorage !== "undefined") localStorage.removeItem(`slotAdj_${selectedGroup}`);
    setSlotAdjustments({});
    const a = await refreshAssignments();
    setHasDraftChanges(false);
    setUndoStack([]);
    // Reload published states
    const ps = await data.fetchPublishedState(selectedGroup);
    if (ps) setPublishedStates({ ...publishedStates, [selectedGroup]: ps });
    toast("Schedules posted to Employee Schedule");
  };

  const handleUndo = async () => {
    if (undoStack.length === 0 || !canEdit) { toast("Nothing to undo"); return; }
    const last = undoStack[undoStack.length - 1];
    await last.action();
    setUndoStack(undoStack.slice(0, -1));
    const a = await refreshAssignments();
    toast(`Undid: ${last.description}`);
  };

  const saveVolumePlan = async () => {
    if (!selectedGroup || !canEdit) return;
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

  const handleVolumeDataFile = async (file: File) => {
    if (!canEdit) return;
    setImporting(true);
    setImportError("");
    setImportResult("");
    try {
      const sheets = await readFileToSheets(file);
      const { points, stats } = parseFile(sheets);
      if (points.length === 0) {
        setImportError(`No rows with recognizable dates/times were found. ${stats.rowsSkipped} rows were skipped. Make sure the file has a date/time column (e.g. "Date" + "Time", or "Timestamp").`);
        return;
      }
      const payloads = points.map((p) => ({
        group_id: selectedGroup,
        event_date: p.date,
        day_of_week: p.dayOfWeek,
        hour: p.hour,
        count: 1,
      }));
      await data.insertVolumeDataPoints(payloads);
      const pts = await data.fetchVolumeDataPoints(selectedGroup);
      volumeDataPointsRef.current = pts;
      setDataPointCount(pts.length);
      const rec = computeVolumeRecommendation(
        pts,
        parseInt(vpStart.split(":")[0]),
        parseInt(vpEnd.split(":")[0])
      );
      if (vpAutoVolume) setVpVolume(rec.hourlyVolume);
      if (vpAutoWeekend) setVpWeekendMult(rec.weekendMultiplier);
      setImportResult(
        `Imported ${stats.rowsImported.toLocaleString()} rows${stats.rowsSkipped > 0 ? ` (${stats.rowsSkipped.toLocaleString()} skipped)` : ""} covering ${stats.dateFrom} to ${stats.dateTo}.` +
        (vpAutoVolume || vpAutoWeekend ? " Expected volume and weekend multiplier were updated automatically." : "")
      );
      await data.logChange(`Imported ${stats.rowsImported} rows of operational data for ${currentGroup?.name}`, "Volume Plan");
    } catch (e) {
      setImportError(`Could not read the file: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  // Guarded manual overrides — confirm before leaving automatic calculation
  const guardOverride = (kind: "volume" | "weekend", proceed: () => void) => {
    const isAuto = kind === "volume" ? vpAutoVolume : vpAutoWeekend;
    if (!isAuto) { proceed(); return; }
    setConfirmDialog({
      title: "Override Automatic Calculation?",
      message:
        kind === "volume"
          ? "Expected volume is currently calculated automatically from your imported data. If you enter a value manually, this hour will no longer update automatically until you re-enable auto calculation. Continue?"
          : "The weekend multiplier is currently calculated automatically from your imported data. If you enter a value manually, it will no longer update automatically until you re-enable auto calculation. Continue?",
      onConfirm: () => {
        setConfirmDialog(null);
        if (kind === "volume") {
          setVpAutoVolume(false);
          if (typeof localStorage !== "undefined") localStorage.setItem(`vpAutoVolume_${selectedGroup}`, "false");
        } else {
          setVpAutoWeekend(false);
          if (typeof localStorage !== "undefined") localStorage.setItem(`vpAutoWeekend_${selectedGroup}`, "false");
        }
        proceed();
      },
    });
  };

  const overrideHourlyVolume = (hour: number, value: number) => {
    guardOverride("volume", () => {
      const v = [...vpVolume];
      v[hour] = value;
      setVpVolume(v);
    });
  };

  const overrideWeekendMult = (value: number) => {
    guardOverride("weekend", () => setVpWeekendMult(value));
  };

  const saveFteBudget = async () => {
    if (!selectedGroup || !canEdit) return;
    await data.upsertFteBudget(selectedGroup, Number(fteInput) || 0);
    const fb = await data.fetchFteBudget(selectedGroup);
    if (fb) setFteBudgets({ ...fteBudgets, [selectedGroup]: fb });
    setEditingFte(false);
    toast("FTE budget saved");
  };

  // ===== Template logic =====

  // Compute the pay-period start date that contains the first day of the current view.
  const payPeriodAnchorForCurrentView = (): Date => {
    const ppStart = new Date(payPeriodStart + "T00:00:00");
    const diffDays = Math.floor((dates[0].getTime() - ppStart.getTime()) / (1000 * 60 * 60 * 24));
    const periodsElapsed = Math.floor(diffDays / 14);
    return addDays(ppStart, periodsElapsed * 14);
  };

  const resolveTemplatePeriod = (): { lengthDays: number; start: Date } => {
    const anchor = payPeriodAnchorForCurrentView();
    if (templatePeriod === "current") {
      return { lengthDays: dates.length, start: anchor };
    }
    const days = templatePeriod === "custom" ? Math.max(1, templateCustomDays) : Number(templatePeriod);
    return { lengthDays: days, start: anchor };
  };

  const handleSaveTemplate = async () => {
    if (!selectedGroup || !isAdmin) return;
    const name = templateName.trim();
    if (!name) { setTemplateNameError("Give the template a name."); return; }
    const { lengthDays, start } = resolveTemplatePeriod();
    const end = addDays(start, lengthDays - 1);
    setTemplatesBusy(true);
    setTemplateNameError("");
    try {
      const periodAssignments = await data.fetchShiftAssignments(selectedGroup, start, end);
      const rows: data.TemplateRowInput[] = periodAssignments
        .filter((a) => a.status !== "Off")
        .map((a) => {
          const d = new Date(a.assignment_date + "T00:00:00");
          const dayOffset = Math.round((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          return {
            member_id: a.member_id,
            day_of_week: d.getDay(),
            day_offset: dayOffset,
            shift_start: a.shift_start,
            shift_end: a.shift_end,
            status: a.status,
            premium_pay_type: (a.premium_pay_type ?? null) as PremiumPayType | null,
            premium_pay_amount: a.premium_pay_amount ?? null,
            include_as_non_prod: a.include_as_non_prod ?? false,
            shift_override_break: a.shift_override_break ?? null,
            borrowed_from_group_id: a.borrowed_from_group_id ?? null,
          };
        });
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      const existing = await data.findTemplateByName(selectedGroup, name);
      if (existing) {
        setPendingReplaceTemplate(existing);
        setRenameValue(name);
        setTemplatesBusy(false);
        return;
      }
      await data.createTemplate(selectedGroup, name, lengthDays, start.getDay(), userId, rows);
      await data.logChange(`Saved schedule template "${name}" for ${currentGroup?.name} (${lengthDays} days)`, "Template");
      const refreshed = await data.fetchTemplates(selectedGroup);
      setTemplates(refreshed);
      setSaveTemplateOpen(false);
      toast(`Template "${name}" saved`);
    } catch (e) {
      setTemplateNameError(String((e as Error).message ?? e));
    } finally {
      setTemplatesBusy(false);
    }
  };

  const handleReplaceTemplate = async () => {
    if (!pendingReplaceTemplate || !selectedGroup) return;
    const name = pendingReplaceTemplate.name;
    const { lengthDays, start } = resolveTemplatePeriod();
    const end = addDays(start, lengthDays - 1);
    setTemplatesBusy(true);
    try {
      const periodAssignments = await data.fetchShiftAssignments(selectedGroup, start, end);
      const rows: data.TemplateRowInput[] = periodAssignments
        .filter((a) => a.status !== "Off")
        .map((a) => {
          const d = new Date(a.assignment_date + "T00:00:00");
          const dayOffset = Math.round((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          return {
            member_id: a.member_id,
            day_of_week: d.getDay(),
            day_offset: dayOffset,
            shift_start: a.shift_start,
            shift_end: a.shift_end,
            status: a.status,
            premium_pay_type: (a.premium_pay_type ?? null) as PremiumPayType | null,
            premium_pay_amount: a.premium_pay_amount ?? null,
            include_as_non_prod: a.include_as_non_prod ?? false,
            shift_override_break: a.shift_override_break ?? null,
            borrowed_from_group_id: a.borrowed_from_group_id ?? null,
          };
        });
      await data.replaceTemplateRows(pendingReplaceTemplate.id, rows);
      await data.logChange(`Replaced schedule template "${name}" for ${currentGroup?.name}`, "Template");
      setPendingReplaceTemplate(null);
      setSaveTemplateOpen(false);
      toast(`Template "${name}" replaced`);
    } catch (e) {
      setTemplateNameError(String((e as Error).message ?? e));
    } finally {
      setTemplatesBusy(false);
    }
  };

  const handleRenameAndSave = async () => {
    if (!pendingReplaceTemplate || !selectedGroup) return;
    const name = renameValue.trim();
    if (!name) { setTemplateNameError("Enter a new name."); return; }
    setTemplatesBusy(true);
    setTemplateNameError("");
    try {
      const dup = await data.findTemplateByName(selectedGroup, name);
      if (dup && dup.id !== pendingReplaceTemplate.id) {
        setTemplateNameError("That name is also taken. Choose another.");
        setTemplatesBusy(false);
        return;
      }
      const { lengthDays, start } = resolveTemplatePeriod();
      const end = addDays(start, lengthDays - 1);
      const periodAssignments = await data.fetchShiftAssignments(selectedGroup, start, end);
      const rows: data.TemplateRowInput[] = periodAssignments
        .filter((a) => a.status !== "Off")
        .map((a) => {
          const d = new Date(a.assignment_date + "T00:00:00");
          const dayOffset = Math.round((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          return {
            member_id: a.member_id,
            day_of_week: d.getDay(),
            day_offset: dayOffset,
            shift_start: a.shift_start,
            shift_end: a.shift_end,
            status: a.status,
            premium_pay_type: (a.premium_pay_type ?? null) as PremiumPayType | null,
            premium_pay_amount: a.premium_pay_amount ?? null,
            include_as_non_prod: a.include_as_non_prod ?? false,
            shift_override_break: a.shift_override_break ?? null,
            borrowed_from_group_id: a.borrowed_from_group_id ?? null,
          };
        });
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      await data.createTemplate(selectedGroup, name, lengthDays, start.getDay(), userId, rows);
      await data.logChange(`Saved schedule template "${name}" for ${currentGroup?.name}`, "Template");
      const refreshed = await data.fetchTemplates(selectedGroup);
      setTemplates(refreshed);
      setPendingReplaceTemplate(null);
      setSaveTemplateOpen(false);
      toast(`Template "${name}" saved`);
    } catch (e) {
      setTemplateNameError(String((e as Error).message ?? e));
    } finally {
      setTemplatesBusy(false);
    }
  };

  const handleApplyTemplate = async (template: ScheduleTemplate) => {
    if (!selectedGroup || !isAdmin) return;
    setTemplatesBusy(true);
    try {
      const rows = await data.fetchTemplateRows(template.id);
      const anchor = payPeriodAnchorForCurrentView();
      const periodLen = template.period_length_days;
      const end = addDays(anchor, periodLen - 1);
      // Clear existing assignments in the template's full window
      await data.deleteAllAssignmentsInRange(selectedGroup, formatDateISO(anchor), formatDateISO(end));
      // Re-create shifts from the template, mapping day_offset to real dates
      let created = 0;
      for (const r of rows) {
        if (r.day_offset < 0 || r.day_offset >= periodLen) continue;
        const targetDate = addDays(anchor, r.day_offset);
        const targetISO = formatDateISO(targetDate);
        await data.upsertShiftAssignment({
          member_id: r.member_id,
          group_id: selectedGroup,
          assignment_date: targetISO,
          shift_start: r.shift_start,
          shift_end: r.shift_end,
          status: r.status,
          is_published: false,
          borrowed_from_group_id: r.borrowed_from_group_id,
          premium_pay_type: (r.premium_pay_type ?? null) as PremiumPayType | null,
          premium_pay_amount: r.premium_pay_amount ?? null,
          include_as_non_prod: r.include_as_non_prod ?? false,
          shift_override_break: r.shift_override_break ?? null,
        });
        created++;
      }
      // Expand the view to show the template's full period
      if (periodLen !== dates.length) {
        if (viewType === "custom") {
          setCustomEndISO(formatDateISO(end));
        } else {
          const newType: ViewType = periodLen === 7 ? "weekly" : periodLen === 14 ? "bi-weekly" : periodLen === 30 ? "monthly" : "custom";
          if (newType === "custom") {
            setViewType("custom");
            setCustomEndISO(formatDateISO(end));
          } else {
            setViewType(newType);
          }
        }
        setRangeStart(anchor);
      }
      await data.logChange(`Applied template "${template.name}" to ${currentGroup?.name}`, "Template");
      setTemplatesModalOpen(false);
      toast(`Applied template "${template.name}" — ${created} shifts created`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setTemplatesBusy(false);
    }
  };

  const handleDeleteTemplate = async (template: ScheduleTemplate) => {
    if (!selectedGroup || !isAdmin) return;
    setTemplatesBusy(true);
    try {
      await data.deleteTemplate(template.id);
      await data.logChange(`Deleted schedule template "${template.name}"`, "Template");
      const refreshed = await data.fetchTemplates(selectedGroup);
      setTemplates(refreshed);
      toast(`Template "${template.name}" deleted`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setTemplatesBusy(false);
    }
  };

  const handleClearAllAssignments = async () => {
    if (!selectedGroup || !canEdit) return;
    const startISO = formatDateISO(dates[0]);
    const endISO = formatDateISO(rangeEnd);
    await data.deleteAllAssignmentsInRange(selectedGroup, startISO, endISO);
    await data.logChange(`Cleared all assignments for ${currentGroup?.name} for ${startISO} to ${endISO}`, "Matrix");
    const a = await refreshAssignments();
    setHasDraftChanges(a.length > 0);
    setUndoStack([]);
    setConfirmDialog(null);
    toast(`Cleared all assignments for ${currentGroup?.name}`);
  };

  const shiftViewType = (newType: ViewType) => {
    setViewType(newType);
    if (newType === "custom") {
      setCustomEndISO(formatDateISO(addDays(rangeStart, 1)));
      return;
    }
    const ppStart = new Date(payPeriodStart + "T00:00:00");
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - ppStart.getTime()) / (1000 * 60 * 60 * 24));
    const periodLen = newType === "bi-weekly" ? 14 : newType === "monthly" ? 30 : newType === "daily" ? 1 : 7;
    const periodsElapsed = Math.floor(diffDays / periodLen);
    setRangeStart(addDays(ppStart, periodsElapsed * periodLen));
  };

  const publishedInfo = publishedStates[selectedGroup];
  const publishedLabel = publishedInfo?.last_published_at
    ? new Date(publishedInfo.last_published_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Not Yet Posted";

  const allGroupsFteVariance = allGroupsBudget > 0 ? Math.round((allGroupsFte.totalFTE / allGroupsBudget) * 100) : 0;
  const allGroupsFteClass = allGroupsBudget > 0
    ? (allGroupsFteVariance < 95 || allGroupsFteVariance > 105 ? "fte-out-of-range" : allGroupsFteVariance > 100 ? "fte-warning" : "fte-in-range")
    : "";

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
              <span className="heading-metric-label">All Groups FTE <small style={{ fontWeight: 400, fontSize: "9px" }}>Weekly Avg</small></span>
              <div className="heading-metric-value" style={allGroupsFteClass ? { color: allGroupsFteClass === "fte-out-of-range" ? "var(--error)" : allGroupsFteClass === "fte-warning" ? "var(--warning)" : "var(--success)" } : undefined}>{allGroupsFte.totalFTE}</div>
              {allGroupsBudget > 0 ? (
                <small className={allGroupsFteClass}>vs {allGroupsBudget} budgeted ({allGroupsFteVariance}%)</small>
              ) : (
                <small>Click To Set Budget</small>
              )}
            </article>
            <article className="heading-metric">
              <span className="heading-metric-label">Weekly Avg Hours</span>
              <div className="heading-metric-value">{allGroupsFte.totalHours}</div>
              <small>{allGroupsFte.totalProductive} Productive · {allGroupsFte.totalNonProductive} Non-Productive</small>
            </article>
          </div>
        </div>
        <div className="heading-actions">
          <Button variant="icon" icon="chevronLeft" onClick={() => navigatePeriod(-1)} />
          <button className="date-control">
            <Icon name="calendar" />
            <span>{formatDateRange(dates[0], rangeEnd)}</span>
            <Icon name="chevronDown" size={16} />
          </button>
          <Button variant="icon" icon="chevronRight" onClick={() => navigatePeriod(1)} />
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
          <button className={viewType === "custom" ? "active" : ""} onClick={() => shiftViewType("custom")}>Custom</button>
        </div>
        {viewType === "custom" && (
          <div className="custom-range-picker">
            <input
              type="date"
              value={formatDateISO(rangeStart)}
              onChange={(e) => {
                if (!e.target.value) return;
                const newStart = new Date(e.target.value + "T00:00:00");
                setRangeStart(newStart);
                if (customEndISO && new Date(customEndISO + "T00:00:00") < addDays(newStart, 1)) {
                  setCustomEndISO(formatDateISO(addDays(newStart, 1)));
                }
              }}
            />
            <span>to</span>
            <input
              type="date"
              value={customEndISO || formatDateISO(addDays(rangeStart, 1))}
              min={formatDateISO(addDays(rangeStart, 1))}
              onChange={(e) => { if (e.target.value) setCustomEndISO(e.target.value); }}
            />
          </div>
        )}
        <div className="pay-period-control">
          <label>Pay Period Start:</label>
          <input type="date" value={payPeriodStart} onChange={(e) => { setPayPeriodStart(e.target.value); if (typeof localStorage !== "undefined") localStorage.setItem("payPeriodStart", e.target.value); }} />
        </div>

        {matrixMode === "schedule" && isAdmin && (
          <>
            <button className="copy-schedule-btn" onClick={() => { setTemplatesModalOpen(true); }}>
              <Icon name="layout" size={13} /> Templates
            </button>
            <button className="clear-period-btn" onClick={() => {
              setConfirmDialog({
                title: "Clear All Assignments",
                message: `This will permanently delete ALL shift assignments for ${currentGroup?.name || "this group"} in the current period (${formatDateRange(dates[0], rangeEnd)}). This cannot be undone. Are you sure?`,
                onConfirm: handleClearAllAssignments,
              });
            }}>
              <Icon name="trash" size={13} /> Clear All Assignments
            </button>
          </>
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
              <div className="metric-top"><span>FTE (Weekly Avg)</span><Icon name="team" size={16} /></div>
              <div className="metric-value" style={fteCalculations.fteClass ? { color: fteCalculations.fteClass === "fte-out-of-range" ? "var(--error)" : fteCalculations.fteClass === "fte-warning" ? "var(--warning)" : "var(--success)" } : undefined}>{fteCalculations.totalFTE}</div>
              <small>
                {fteCalculations.budget > 0 ? (
                  <span className={fteCalculations.fteClass}>
                    vs {fteCalculations.budget} budgeted ({fteCalculations.fteVariance}%)
                  </span>
                ) : (
                  <span>Click to set budget</span>
                )}
              </small>
            </article>
            <article className="metric">
              <div className="metric-top"><span>Weekly Avg Hours</span></div>
              <div className="metric-value">{fteCalculations.totalHours}</div>
              <small>Weekly Avg: {fteCalculations.totalProductive} Prod / {fteCalculations.totalNonProd} Non-Prod</small>
            </article>
            <article className="metric">
              <div className="metric-top"><span>Labor Spend</span></div>
              <div className="metric-value">${laborSpend.toLocaleString()}</div>
              <small>Including OT & premium pay</small>
            </article>
            <article className="metric">
              <div className="metric-top"><span>Posted</span><Icon name="check" size={16} /></div>
              <div className="metric-value" style={{ fontSize: "14px" }}>{publishedLabel}</div>
              <small>{hasDraftChanges ? "Draft changes pending" : "No draft changes"}</small>
            </article>
          </section>

          {/* Draft status + action buttons */}
          <div className="matrix-action-bar">
            <div className="draft-status">
              {hasDraftChanges && (
                <div className="draft-warning">
                  <Icon name="alert" size={14} /> Staffing matrix saved but not posted
                </div>
              )}
            </div>
            <div className="matrix-actions">
              <Button icon="undo" onClick={handleUndo}>Undo last change</Button>
              <Button icon="save" onClick={handleSaveDraft}>Save draft</Button>
              {isAdmin && <Button icon="layout" onClick={() => { setTemplateName(""); setTemplatePeriod("current"); setTemplateNameError(""); setSaveTemplateOpen(true); }}>Save Template</Button>}
              <Button variant="primary" icon="check" onClick={handlePublish}>Post schedules</Button>
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
                    <span><i className="legend-training" />Non-Productive</span>
                    <span><i className="legend-ot" />Overtime</span>
                    <span><i className="legend-premium" />Premium Pay</span>
                    <span><i className="legend-diff-time" />Different Shift Time</span>
                    <span><i className="legend-draft-edited" />Edited (Not Posted)</span>
                  </div>
                )}
              </div>
            </div>

            {matrixMode === "schedule" && (
              <div className="schedule-scroll">
                <table className="schedule-matrix">
                  <thead>
                    <tr className="week-band">
                      <th>Shift And Staff</th>
                      {Array.from({ length: Math.ceil(dates.length / 7) }, (_, wi) => {
                        const wkStart = dates[wi * 7];
                        const wkEnd = dates[Math.min((wi + 1) * 7 - 1, dates.length - 1)];
                        return (
                          <th key={wi} colSpan={Math.min(7, dates.length - wi * 7)}>Week {wi + 1} ({formatDate(wkStart)} – {formatDate(wkEnd)})</th>
                        );
                      })}
                    </tr>
                    <tr>
                      <th>Team Member</th>
                      {dates.map((date) => {
                        const dateISO = formatDateISO(date);
                        const holiday = holidayByDate[dateISO];
                        return (
                          <th key={dateISO} className={`${isWeekend(date) ? "weekend" : ""} ${holiday ? "holiday-col" : ""}`}>
                            {holiday && <em className="holiday-name">{holiday.name}</em>}
                            <strong>{dayNames[date.getDay()]}</strong>
                            <span>{formatDate(date)}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {opsHours.map((hour) => {
                      const hourMembers = membersByStartHour.get(hour) || [];
                      const openSlots = slotsForHour(hour);

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
                            {dates.map((date) => {
                              const dateISO = formatDateISO(date);
                              const isHolidayCol = !!holidayByDate[dateISO];
                              return (
                                <td key={dateISO} className={`${isWeekend(date) ? "weekend" : ""} ${isHolidayCol ? "holiday-col" : ""}`} />
                              );
                            })}
                          </tr>
                          {!isCollapsed && hourMembers.map((member) => {
                            const schedHrs = memberScheduledHours(member);
                            const otHrs = memberOvertimeHours(member);
                            const isOT = otHrs > 0;
                            // Determine which hours this member actually has shifts at
                            const memberShiftHours = new Set<number>();
                            for (const d of dates) {
                              const sh = getMemberShiftForDate(member.id, formatDateISO(d));
                              if ((sh.status === "Scheduled" || sh.status === "Premium Pay") && sh.start) {
                                memberShiftHours.add(parseInt(sh.start.split(":")[0]));
                              }
                            }
                            return (
                              <tr key={member.id} className={`employee-row ${member.status !== "Productive" ? "nonproductive-row" : ""}`}>
                                <td className="name-cell">
                                  <div className="name-cell-inner">
                                    <strong>{member.name}</strong>
                                    <span className={`employee-hours ${isOT ? "ot-warning" : ""}`}>{hoursLabel(schedHrs)} scheduled{isOT ? ` · ${otHrs}h OT` : ""}</span>
                                  </div>
                                  <button className="row-delete-btn" onClick={() => {
                                    const dateISOs = dates.map((d) => formatDateISO(d));
                                    const deletedShifts: { dateISO: string; data: ShiftAssignment }[] = [];
                                    for (const dateISO of dateISOs) {
                                      const shift = getMemberShiftForDate(member.id, dateISO);
                                      if ((shift.status === "Scheduled" || shift.status === "Premium Pay") && shift.start && parseInt(shift.start.split(":")[0]) === hour) {
                                        const a = getMemberAssignment(member.id, dateISO);
                                        if (a) deletedShifts.push({ dateISO, data: a });
                                      }
                                    }
                                    setConfirmDialog({
                                      title: "Remove Employee From This Shift",
                                      message: `Are you sure? This will remove all scheduled shifts at ${formatHour24(hour)} for ${member.name} across the displayed period (${deletedShifts.length} shift${deletedShifts.length !== 1 ? "s" : ""}).`,
                                      onConfirm: async () => {
                                        setConfirmDialog(null);
                                        let hadShift = false;
                                        for (const { dateISO } of deletedShifts) {
                                          await data.deleteShiftAssignment(member.id, dateISO);
                                          hadShift = true;
                                        }
                                        setPendingRowMembers((prev) => {
                                          const next = new Map(prev);
                                          const list = next.get(hour);
                                          if (list) next.set(hour, list.filter((m) => m.id !== member.id));
                                          return next;
                                        });
                                        if (hadShift) {
                                          await data.logChange(`Removed ${member.name} from ${formatHour24(hour)} line in ${currentGroup?.name}`, "Matrix");
                                          const a = await refreshAssignments();
                                          setHasDraftChanges(true);
                                          setUndoStack((prev) => [...prev, {
                                            description: `Remove ${member.name} from ${formatHour24(hour)}`,
                                            action: async () => {
                                              for (const { data: d } of deletedShifts) {
                                                await data.upsertShiftAssignment({
                                                  member_id: d.member_id,
                                                  group_id: d.group_id,
                                                  assignment_date: d.assignment_date,
                                                  shift_start: d.shift_start,
                                                  shift_end: d.shift_end,
                                                  status: d.status,
                                                  is_published: d.is_published,
                                                  borrowed_from_group_id: d.borrowed_from_group_id,
                                                  premium_pay_type: d.premium_pay_type as any,
                                                  premium_pay_amount: d.premium_pay_amount as any,
                                                  include_as_non_prod: d.include_as_non_prod || false,
                                                });
                                              }
                                            },
                                          }]);
                                        }
                                        toast(`${member.name} removed from ${formatHour24(hour)}`);
                                      },
                                    });
                                  }} aria-label={`Remove ${member.name} from this hour`} title="Remove from this hour">&#x2715;</button>
                                </td>
                                {dates.map((date) => {
                                  const dateISO = formatDateISO(date);
                                  const shift = getMemberShiftForDate(member.id, dateISO);
                                  const cellLabel = formatShiftDisplay(shift.start, shift.end, shift.status);
                                  const isDiffTime = (shift.status === "Scheduled" || shift.status === "Premium Pay") && shift.start && parseInt(shift.start.split(":")[0]) !== hour;
                                  const a = getMemberAssignment(member.id, dateISO);
                                  const isDraftEdit = !!a && !a.is_published;
                                  const cellClass = shift.status === "Off" ? "off" : shift.status === "PTO" || shift.status === "LOA" || shift.status === "Vacation" ? "leave" : shift.status === "Premium Pay" ? "premium-pay" : isOT ? "ot-cell" : "";
                                  return (
                                    <td key={dateISO} className={`${isWeekend(date) ? "weekend" : ""} ${holidayByDate[dateISO] ? "holiday-col" : ""}`}>
                                      <button
                                        className={`shift-cell ${cellClass} ${isDiffTime ? "diff-time" : ""} ${isDraftEdit ? "draft-edited" : ""}`}
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
                          {/* Open slot rows — one per unfilled slot */}
                          {!isCollapsed && Array.from({ length: openSlots }).map((_, slotIdx) => (
                            <tr key={`open-${hour}-${slotIdx}`} className="open-slot-row">
                              <td colSpan={2} className="open-slot-name-cell">
                                <span className="open-slot-label">Open Shift {slotIdx + 1}</span>
                                <button
                                  className="open-slot-delete-btn"
                                  onClick={() => {
                                    updateSlotAdjustment(hour, -1);
                                    toast(`Removed slot at ${formatHour24(hour)}`);
                                  }}
                                  aria-label="Remove slot"
                                >&#x2715;</button>
                              </td>
                              {dates.map((date) => {
                                const dateISO = formatDateISO(date);
                                const isHolidayCol = !!holidayByDate[dateISO];
                                return (
                                  <td key={dateISO} className={`${isWeekend(date) ? "weekend" : ""} ${isHolidayCol ? "holiday-col" : ""}`}>
                                    <button
                                      className="shift-cell open-slot-shift"
                                      onClick={() => setAssignPanel({ hour, dateISO })}
                                    >
                                      <span>+ Assign</span>
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                          {/* Subtotal row — always visible */}
                          <tr className={`shift-subtotal-row ${isCollapsed ? "collapsed" : ""}`}>
                            <td className="shift-subtotal-label">Staff at {formatHour24(hour)}</td>
                            {dates.map((date) => {
                              const dateISO = formatDateISO(date);
                              const working = staffAtHour(hour, date);
                              const needed = neededAt(hour, isWeekend(date));
                              const cls = working === 0 ? "zero" : working < needed ? "partial" : "full";
                              return (
                                <td key={dateISO} className={`shift-subtotal-cell ${isWeekend(date) ? "weekend" : ""} ${holidayByDate[dateISO] ? "holiday-col" : ""} ${cls}`}>
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
                  <div className="vs-divider" />
                  <div className="volume-setting">
                    <div>
                      <span className="vs-label">Operational data</span>
                      <span className="vs-hint">{dataPointCount > 0 ? `${dataPointCount.toLocaleString()} rows imported — volume auto-calculated` : "Import data to auto-calculate expected volume"}</span>
                    </div>
                    <Button icon="upload" onClick={() => { setImportModalOpen(true); setImportResult(""); setImportError(""); }}>Import Data</Button>
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
                        {dataPointCount > 0 && (
                          <label className="checkbox-label auto-calc-toggle" style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                            <input type="checkbox" checked={vpAutoVolume} onChange={(e) => {
                              if (e.target.checked) {
                                setVpAutoVolume(true);
                                if (typeof localStorage !== "undefined") localStorage.setItem(`vpAutoVolume_${selectedGroup}`, "true");
                                const rec = computeVolumeRecommendation(
                                  volumeDataPointsRef.current,
                                  parseInt(vpStart.split(":")[0]),
                                  parseInt(vpEnd.split(":")[0])
                                );
                                setVpVolume(rec.hourlyVolume);
                              } else {
                                setVpAutoVolume(false);
                                if (typeof localStorage !== "undefined") localStorage.setItem(`vpAutoVolume_${selectedGroup}`, "false");
                              }
                            }} />
                            <span>Auto volume from imported data</span>
                          </label>
                        )}
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
                        <input type="number" min="0" step="0.05" value={vpWeekendMult} onChange={(e) => overrideWeekendMult(Number(e.target.value) || 0)} className="rate-input" />
                        {dataPointCount > 0 && (
                          <label className="checkbox-label auto-calc-toggle" style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                            <input type="checkbox" checked={vpAutoWeekend} onChange={(e) => {
                              if (e.target.checked) {
                                setVpAutoWeekend(true);
                                if (typeof localStorage !== "undefined") localStorage.setItem(`vpAutoWeekend_${selectedGroup}`, "true");
                                const rec = computeVolumeRecommendation(
                                  volumeDataPointsRef.current,
                                  parseInt(vpStart.split(":")[0]),
                                  parseInt(vpEnd.split(":")[0])
                                );
                                setVpWeekendMult(rec.weekendMultiplier);
                              } else {
                                setVpAutoWeekend(false);
                                if (typeof localStorage !== "undefined") localStorage.setItem(`vpAutoWeekend_${selectedGroup}`, "false");
                              }
                            }} />
                            <span>Auto</span>
                          </label>
                        )}
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
                                    <input type="number" min="0" value={vol} onChange={(e) => overrideHourlyVolume(hour, Number(e.target.value) || 0)} className="volume-input" style={dataPointCount > 0 && !vpAutoVolume ? { borderColor: "var(--warning)" } : undefined} />
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
          {editingMember.notes && (
            <div className="member-notes-box">
              <strong>Availability Notes</strong>
              <p>{editingMember.notes}</p>
            </div>
          )}
          <label>Date
            <div className="editor-date-display">{editingDate}</div>
          </label>
          <label>Status
            <select value={editStatus} onChange={(e) => { setEditStatus(e.target.value as ShiftStatus); setEditIncludeNonProd(false); }}>
              <option value="Scheduled">Productive</option>
              <option value="Premium Pay">Premium Pay</option>
              <option value="Off">Off</option>
              <option value="PTO">PTO</option>
              <option value="LOA">LOA</option>
              <option value="Vacation">Vacation</option>
              <option value="Training">Training</option>
            </select>
          </label>
          {(editStatus === "PTO" || editStatus === "LOA" || editStatus === "Vacation" || editStatus === "Training") && (
            <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input type="checkbox" checked={editIncludeNonProd} onChange={(e) => setEditIncludeNonProd(e.target.checked)} />
              <span>Include these hours in non-productive totals</span>
            </label>
          )}
          {hasShiftTimes(editStatus) && (
            <>
              <label>Shift Time
                <div className="shift-time-inputs">
                  <div className="shift-time-field"><span>Start</span><input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} /></div>
                  <span className="shift-time-sep">→</span>
                  <div className="shift-time-field"><span>End</span><input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} /></div>
                </div>
              </label>
              {(editStatus === "Scheduled" || editStatus === "Premium Pay") && (
                <label>Add Lunch Break (hours)
                  <div className="lunch-break-row">
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      placeholder={String(editingMember.daily_unpaid_break)}
                      value={editLunchBreak ?? ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? null : Number(e.target.value);
                        setEditLunchBreak(val);
                      }}
                    />
                    <span className="modal-hint" style={{ margin: 0 }}>
                      Default: {editingMember.daily_unpaid_break} hrs (from Team tab). Enter a different value to override for this shift only.
                    </span>
                  </div>
                </label>
              )}
            </>
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

      {/* Volume Data Import Modal */}
      {importModalOpen && (
        <Modal
          title="Import Operational Data"
          subtitle="Upload Timestamped Rows — Expected Volume And The Weekend Multiplier Are Recalculated Automatically."
          onClose={() => setImportModalOpen(false)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setImportModalOpen(false)}>Close</Button>
              </div>
            </>
          }
        >
          <p className="modal-hint">
            Upload a CSV, TSV, or Excel file with one row per event (job, transport, task) and a date/time column
            (for example "Timestamp", or "Date" plus "Time"). Rows are counted by hour of day and day of week.
            Data outside your hours of operation is stored but only shown if you expand the hours later.
            Importing more data over time refines the averages — nothing is overwritten.
          </p>
          <label className="volume-import-file-label">
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleVolumeDataFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {importing && <p className="modal-hint">Reading and importing data…</p>}
          {importResult && <div className="import-success"><Icon name="check" size={16} /> {importResult}</div>}
          {importError && <div className="error-banner"><Icon name="alert" size={16} /> {importError}</div>}
          {dataPointCount > 0 && !importing && (
            <p className="modal-hint">Current total for this group: {dataPointCount.toLocaleString()} imported rows. {lastImportInfo}</p>
          )}
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
                        <div className="assign-member-text">
                          <strong>{member.name}</strong>
                          <span>{memberGroup?.name}</span>
                          {member.notes && <small className="assign-member-note">{member.notes}</small>}
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
      {/* Save Template Modal */}
      {saveTemplateOpen && (
        <Modal
          title="Save Schedule Template"
          subtitle={`Capture the current schedule for ${currentGroup?.name} as a reusable template.`}
          onClose={() => { setSaveTemplateOpen(false); setPendingReplaceTemplate(null); setTemplateNameError(""); }}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => { setSaveTemplateOpen(false); setPendingReplaceTemplate(null); setTemplateNameError(""); }}>Cancel</Button>
                {!pendingReplaceTemplate && <Button variant="primary" onClick={handleSaveTemplate} disabled={templatesBusy}>{templatesBusy ? "Saving…" : "Save Template"}</Button>}
                {pendingReplaceTemplate && <Button variant="primary" onClick={handleReplaceTemplate} disabled={templatesBusy}>Replace</Button>}
                {pendingReplaceTemplate && <Button onClick={handleRenameAndSave} disabled={templatesBusy}>Save as new name</Button>}
              </div>
            </>
          }
        >
          {!pendingReplaceTemplate && (
            <>
              <label>Template name
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => { setTemplateName(e.target.value); setTemplateNameError(""); }}
                  placeholder="e.g. Summer Bi-Weekly"
                  autoFocus
                />
              </label>
              <label>Period to save
                <select value={templatePeriod} onChange={(e) => setTemplatePeriod(e.target.value as typeof templatePeriod)}>
                  <option value="current">Current view ({dates.length} days)</option>
                  <option value="7">One week (7 days)</option>
                  <option value="14">Two weeks (14 days)</option>
                  <option value="30">One month (30 days)</option>
                  <option value="custom">Custom length</option>
                </select>
              </label>
              {templatePeriod === "custom" && (
                <label>Number of days
                  <input type="number" min={1} value={templateCustomDays} onChange={(e) => setTemplateCustomDays(Math.max(1, Number(e.target.value) || 1))} />
                </label>
              )}
              <p className="modal-hint">The template is anchored to the start of the pay period that covers the current view, so saved days line up with future pay periods when reused.</p>
              {templateNameError && <div className="error-banner"><Icon name="alert" size={16} /> {templateNameError}</div>}
            </>
          )}
          {pendingReplaceTemplate && (
            <>
              <div className="conflict-message">
                <Icon name="alert" size={24} />
                <p>A template named "{pendingReplaceTemplate.name}" already exists for {currentGroup?.name}. Would you like to replace it, or save under a new name?</p>
              </div>
              <label>Save under a new name
                <input type="text" value={renameValue} onChange={(e) => { setRenameValue(e.target.value); setTemplateNameError(""); }} autoFocus />
              </label>
              {templateNameError && <div className="error-banner"><Icon name="alert" size={16} /> {templateNameError}</div>}
            </>
          )}
        </Modal>
      )}

      {/* Templates Library Modal */}
      {templatesModalOpen && (
        <Modal
          title="Schedule Templates"
          subtitle={`Saved templates for ${currentGroup?.name}`}
          onClose={() => setTemplatesModalOpen(false)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setTemplatesModalOpen(false)}>Close</Button>
              </div>
            </>
          }
        >
          {templates.length === 0 ? (
            <p className="modal-hint">No templates saved yet. Build a schedule, then click "Save Template" to capture it for reuse.</p>
          ) : (
            <div className="auth-claim-list">
              {templates.map((t) => (
                <div className="auth-claim-row" key={t.id}>
                  <div>
                    <strong>{t.name}</strong>
                    <span>{t.period_length_days} days · starts {dayNames[t.start_day_of_week]}</span>
                  </div>
                  <div className="access-actions">
                    <Button
                      variant="primary"
                      onClick={() => {
                        setConfirmDialog({
                          title: "Apply Template",
                          message: `Note: selecting this template will remove any previously scheduled shifts for the current time period. Do you wish to proceed?`,
                          onConfirm: () => { setConfirmDialog(null); handleApplyTemplate(t); },
                        });
                      }}
                      disabled={templatesBusy}
                    >
                      Add
                    </Button>
                    <button
                      className="access-remove"
                      onClick={() => {
                        setConfirmDialog({
                          title: "Delete Template",
                          message: `Note: Deleting this template will remove it permanently. Are you sure you want to proceed?`,
                          onConfirm: () => { setConfirmDialog(null); handleDeleteTemplate(t); },
                        });
                      }}
                      disabled={templatesBusy}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <Modal
          title={confirmDialog.title}
          onClose={() => setConfirmDialog(null)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
                <Button variant="primary" onClick={confirmDialog.onConfirm}>Confirm</Button>
              </div>
            </>
          }
        >
          <div className="conflict-message">
            <Icon name="alert" size={24} />
            <p>{confirmDialog.message}</p>
          </div>
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
