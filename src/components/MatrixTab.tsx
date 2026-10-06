import { useEffect, useState, useMemo, useCallback } from "react";
import { Fragment } from "react";
import type { AssignmentGroup, TeamMember, ShiftAssignment, VolumePlan, FteBudget, PublishedState, ViewType, MatrixMode, ShiftStatus } from "../lib/types";
import * as data from "../lib/data";
import { Icon, Button, Modal, ConfirmBanner, type IconName } from "./ui";
import {
  GROUP_COLORS, getCurrentBiweeklyStart, getDateRange, formatDateRange, formatDateISO, addDays,
  dayNames, isWeekend, generateHourLabels, hourLabel, formatHour24, slotEndForHour,
  inputTimeValue, shiftDuration, isActiveAt, formatShiftDisplay, compactShift, hoursLabel,
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
  const [insightsCollapsed, setInsightsCollapsed] = useState(false);

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

  // Conflict resolution
  const [conflict, setConflict] = useState<{
    message: string;
    onReplace: () => void;
    onIgnore: () => void;
  } | null>(null);

  // Assign panel
  const [assignPanel, setAssignPanel] = useState<{ hour: number; dateISO: string } | null>(null);
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
      if (shift.status === "Scheduled" && shift.start && shift.end) {
        const dur = shiftDuration(shift.start, shift.end);
        total += Math.max(0, dur - member.daily_unpaid_break);
      }
    }
    return Math.round(total * 10) / 10;
  };

  // FTE calculations
  const fteCalculations = useMemo(() => {
    const week1Dates = dates.slice(0, 7);
    const week2Dates = dates.slice(7, 14);
    const calcWeekHours = (weekDates: Date[]) => {
      let total = 0;
      for (const member of groupMembers) {
        if (member.status !== "Productive") continue;
        for (const date of weekDates) {
          const dateISO = formatDateISO(date);
          const shift = getMemberShiftForDate(member.id, dateISO);
          if (shift.status === "Scheduled" && shift.start && shift.end) {
            total += shiftDuration(shift.start, shift.end);
          }
        }
      }
      return Math.round(total * 10) / 10;
    };
    const week1Hours = calcWeekHours(week1Dates);
    const week2Hours = calcWeekHours(week2Dates);
    const totalHours = week1Hours + week2Hours;
    const totalFTE = Math.round((totalHours / 40) * 100) / 100;
    const budget = fteBudgets[selectedGroup]?.budgeted_fte || 0;
    const fteVariance = budget > 0 ? Math.round((totalFTE / budget) * 100) : 0;
    const fteOutOfRange = budget > 0 && (fteVariance < 95 || fteVariance > 105);
    return { week1Hours, week2Hours, totalHours, totalFTE, budget, fteVariance, fteOutOfRange };
  }, [groupMembers, assignments, dates, selectedGroup, fteBudgets]);

  // Staff at each hour per day
  const staffAtHour = (hour: number, date: Date): number => {
    const dateISO = formatDateISO(date);
    return groupMembers.filter((m) => {
      if (m.status !== "Productive") return false;
      const shift = getMemberShiftForDate(m.id, dateISO);
      if (shift.status !== "Scheduled" || !shift.start || !shift.end) return false;
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

  // Hourly shift grouping (members grouped by their shift start hour)
  const membersByStartHour = useMemo(() => {
    const map = new Map<number, TeamMember[]>();
    for (const member of groupMembers) {
      const h = parseInt(member.default_shift_start.split(":")[0]);
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(member);
    }
    return map;
  }, [groupMembers]);

  // Slot count per hour (from volume plan or default 1)
  const slotsForHour = (hour: number): number => {
    if (vpEnabled) {
      return neededAt(hour, false);
    }
    // Default: 1 slot per hour in ops range
    return 1;
  };

  const openEditor = (member: TeamMember, date: Date) => {
    const dateISO = formatDateISO(date);
    const shift = getMemberShiftForDate(member.id, dateISO);
    setEditingMember(member);
    setEditingDate(dateISO);
    if (shift.start && shift.status === "Scheduled") {
      setEditStart(shift.start);
      setEditEnd(shift.end || "");
      setEditStatus("Scheduled");
    } else if (shift.status !== "Scheduled" && shift.status !== "Off") {
      setEditStart("");
      setEditEnd("");
      setEditStatus(shift.status);
    } else {
      setEditStart(member.default_shift_start);
      setEditEnd(member.default_shift_end);
      setEditStatus("Scheduled");
    }
    setEditorOpen(true);
  };

  const saveShift = async () => {
    if (!editingMember) return;
    const status: ShiftStatus = editStatus;
    const shiftStart = status === "Scheduled" ? editStart : null;
    const shiftEnd = status === "Scheduled" ? editEnd : null;

    // Check for existing assignment on same day for this member in another group
    const existingOtherGroup = await data.fetchShiftForMemberOnDate(editingMember.id, editingDate);
    const hasOtherGroupAssignment = existingOtherGroup && existingOtherGroup.group_id !== selectedGroup;

    const doSave = async () => {
      await data.upsertShiftAssignment({
        member_id: editingMember.id,
        group_id: selectedGroup,
        assignment_date: editingDate,
        shift_start: shiftStart,
        shift_end: shiftEnd,
        status,
        is_published: false,
      });
      await data.logChange(`Updated ${editingMember.name}'s shift on ${editingDate} in ${currentGroup?.name}`, "Matrix");
      const a = await data.fetchShiftAssignments(selectedGroup, dates[0], rangeEnd);
      setAssignments(a);
      setHasDraftChanges(true);
      setEditorOpen(false);
      toast(`Shift updated for ${editingMember.name}`);
    };

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
      // Check if member already has a shift on same day in this group
      const existing = getMemberAssignment(editingMember.id, editingDate);
      if (existing && existing.status === "Scheduled" && existing.shift_start) {
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

  const assignToOpenSlot = async (member: TeamMember, hour: number, dateISO: string) => {
    const repShiftEnd = slotEndForHour(hour, 8.5);
    const existing = await data.fetchShiftForMemberOnDate(member.id, dateISO);
    const hasOtherAssignment = existing && existing.group_id !== selectedGroup;
    const hasSameDayAssignment = existing && existing.group_id === selectedGroup && existing.status === "Scheduled";

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

  const shiftViewType = (newType: ViewType) => {
    setViewType(newType);
    if (newType === "daily") setRangeStart(getCurrentBiweeklyStart());
    else if (newType === "weekly") setRangeStart(getCurrentBiweeklyStart());
    else if (newType === "bi-weekly") setRangeStart(getCurrentBiweeklyStart());
    else if (newType === "monthly") setRangeStart(getCurrentBiweeklyStart());
  };

  const publishedInfo = publishedStates[selectedGroup];
  const publishedLabel = publishedInfo?.last_published_at
    ? new Date(publishedInfo.last_published_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Not yet published";

  const availableToAssign = borrowMode
    ? members
    : groupMembers;

  if (loading) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      {error && <div className="error-banner"><Icon name="alert" size={16} /> {error}</div>}

      <section className="page-heading">
        <div>
          <div className="title-row">
            <h1>Staffing matrix</h1>
            {hasDraftChanges && <span className="status-pill">Unsaved draft</span>}
          </div>
          <p>Build a schedule around expected demand.</p>
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

      {/* View type selector */}
      <div className="view-type-bar">
        <label>View:</label>
        <div className="view-toggle">
          <button className={viewType === "daily" ? "active" : ""} onClick={() => shiftViewType("daily")}>Daily</button>
          <button className={viewType === "weekly" ? "active" : ""} onClick={() => shiftViewType("weekly")}>Weekly</button>
          <button className={viewType === "bi-weekly" ? "active" : ""} onClick={() => shiftViewType("bi-weekly")}>Bi-weekly</button>
          <button className={viewType === "monthly" ? "active" : ""} onClick={() => shiftViewType("monthly")}>Monthly</button>
        </div>
        <input
          type="date"
          className="date-picker-inline"
          value={formatDateISO(rangeStart)}
          onChange={(e) => {
            const d = new Date(e.target.value);
            // Align to Sunday for weekly/bi-weekly/monthly
            if (viewType !== "daily") {
              d.setDate(d.getDate() - d.getDay());
            }
            setRangeStart(d);
          }}
        />
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

          {/* Metrics with FTE */}
          <section className="metrics">
            <article className="metric" onClick={() => { setEditingFte(true); setFteInput(String(fteCalculations.budget || "")); }} style={{ cursor: "pointer" }}>
              <div className="metric-top"><span>FTE (scheduled)</span><Icon name="team" size={16} /></div>
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
              <div className="metric-top"><span>Week 1 hours</span></div>
              <div className="metric-value">{fteCalculations.week1Hours}</div>
              <small>{Math.round(fteCalculations.week1Hours / 40 * 100) / 100} FTE</small>
            </article>
            <article className="metric">
              <div className="metric-top"><span>Week 2 hours</span></div>
              <div className="metric-value">{fteCalculations.week2Hours}</div>
              <small>{Math.round(fteCalculations.week2Hours / 40 * 100) / 100} FTE</small>
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
                <p>{groupMembers.length} members · {viewType} view</p>
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
                    <span><i className="legend-training" />Non-productive</span>
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
                      <th>Team member</th>
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
                      const hourMembers = groupMembers.filter((m) => parseInt(m.default_shift_start.split(":")[0]) === hour);
                      const totalSlots = slotsForHour(hour);
                      const productiveCount = hourMembers.filter((m) => m.status === "Productive").length;
                      const openSlots = Math.max(0, totalSlots - productiveCount);

                      return (
                        <Fragment key={hour}>
                          <tr className="shift-header-row">
                            <td colSpan={dates.length + 2}>
                              <span className="shift-name">{formatHour24(hour)}</span>
                              <span className="shift-count">{productiveCount} assigned · {totalSlots} slots needed</span>
                              <button className="shift-add-btn" onClick={async () => {
                                // Add 1 to volume for this hour if VP enabled, else just visual
                                toast(`Added slot at ${formatHour24(hour)}`);
                              }}>
                                <Icon name="plus" size={11} />Add slot
                              </button>
                            </td>
                          </tr>
                          {hourMembers.map((member) => {
                            const schedHrs = memberScheduledHours(member);
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
                                    <span className="employee-hours">{hoursLabel(schedHrs)} scheduled</span>
                                  </div>
                                </td>
                                {dates.map((date) => {
                                  const dateISO = formatDateISO(date);
                                  const shift = getMemberShiftForDate(member.id, dateISO);
                                  const cellLabel = formatShiftDisplay(shift.start, shift.end, shift.status);
                                  return (
                                    <td key={dateISO} className={isWeekend(date) ? "weekend" : ""}>
                                      <button
                                        className={`shift-cell ${shift.status === "Off" ? "off" : shift.status === "PTO" || shift.status === "LOA" || shift.status === "Vacation" ? "leave" : ""}`}
                                        onClick={() => openEditor(member, date)}
                                      >
                                        <span>{cellLabel}</span>
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                          {/* Open slot rows */}
                          {Array.from({ length: openSlots }, (_, i) => (
                            <tr key={`open-${hour}-${i}`} className="open-slot-row">
                              <td className="open-slot-status-cell"><span className="open-slot-badge">Open</span></td>
                              <td className="name-cell open-slot-name-cell">
                                <button className="assign-slot-btn" onClick={() => { setAssignPanel({ hour, dateISO: formatDateISO(dates[0]) }); setAssignSearch(""); setBorrowMode(false); }}>
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
                          {/* Subtotal row */}
                          <tr className="shift-subtotal-row">
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
                            <th>Expected volume<span>Weekday</span></th>
                            <th>Staff needed<span>Weekday</span></th>
                            <th>Expected volume<span>Weekend ({Math.round(vpWeekendMult * 100)}%)</span></th>
                            <th>Staff needed<span>Weekend</span></th>
                            <th>Volume bar</th>
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
                    <h4>Volume plan is disabled</h4>
                    <p>The staffing matrix will default to the hours of service from the group assignment. Each hour defaults to one staff member. Enable volume planning to automatically calculate staffing needs from expected demand.</p>
                  </div>
                )}

                <div className="matrix-footer">
                  <span>Changes to the volume plan update the By Shift grid in real time</span>
                  <Button variant="primary" icon="save" onClick={saveVolumePlan}>Save volume plan</Button>
                </div>
              </div>
            )}
          </section>

          {/* Insights (collapsible) */}
          <section className="insights insights-wide">
            <div className="insights-title" onClick={() => setInsightsCollapsed(!insightsCollapsed)} style={{ cursor: "pointer" }}>
              <span className="ai-icon"><Icon name="sparkles" size={17} /></span>
              <div><h2>Schedule insights</h2><p>3 ways to strengthen coverage</p></div>
              <Icon name={insightsCollapsed ? "chevronRight" : "chevronDown"} size={18} />
            </div>
            {!insightsCollapsed && (
              <>
                <article className="insight-card priority">
                  <div className="insight-label"><Icon name="lightbulb" size={15} />Best match</div>
                  <h3>Close Saturday midday gap</h3>
                  <p>Consider moving a team member's Saturday assignment to 11 AM. This covers peak demand without adding hours.</p>
                  <div className="impact"><span>Sat, 12-2 PM</span><strong>+1 coverage</strong></div>
                  <div className="insight-actions"><Button variant="primary" onClick={() => toast("Suggestion noted")}>Apply change</Button><Button variant="ghost" onClick={() => toast("Suggestion dismissed")}>Dismiss</Button></div>
                </article>
                <article className="insight-card">
                  <div className="insight-label neutral">Pattern found</div>
                  <h3>Friday volume runs higher</h3>
                  <p>Demand exceeded forecast on 4 of the last 6 Fridays. Consider adding a flex shift.</p>
                  <button className="text-action" onClick={() => toast("Reviewing open shifts")}>Review open shifts <Icon name="chevronRight" size={15} /></button>
                </article>
                <article className="insight-card">
                  <div className="insight-label neutral">Weekend</div>
                  <h3>Reuse a proven rotation</h3>
                  <p>This weekend matches the Aug 22 volume profile. That schedule reached 98% coverage.</p>
                  <button className="text-action" onClick={() => toast("Historical schedule loaded for comparison")}>Compare schedule <Icon name="chevronRight" size={15} /></button>
                </article>
                <div className="ai-note"><Icon name="sparkles" size={16} /><p>Suggestions learn from accepted changes and historical demand. You stay in control.</p></div>
              </>
            )}
          </section>
        </>
      )}

      {/* Shift Editor Modal */}
      {editorOpen && editingMember && (
        <Modal
          title="Edit assignment"
          subtitle={editingMember.name}
          onClose={() => setEditorOpen(false)}
          footer={
            <>
              <button className="btn-remove-shift" onClick={removeShift}>Remove shift</button>
              <div className="modal-actions-right">
                <Button onClick={() => setEditorOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={saveShift}>Save assignment</Button>
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
              <option value="Off">Off</option>
              <option value="PTO">PTO</option>
              <option value="LOA">LOA</option>
              <option value="Vacation">Vacation</option>
            </select>
          </label>
          {editStatus === "Scheduled" && (
            <label>Shift time
              <div className="shift-time-inputs">
                <div className="shift-time-field"><span>Start</span><input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} /></div>
                <span className="shift-time-sep">→</span>
                <div className="shift-time-field"><span>End</span><input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} /></div>
              </div>
            </label>
          )}
        </Modal>
      )}

      {/* Conflict Resolution Modal */}
      {conflict && (
        <Modal
          title="Assignment conflict"
          subtitle="This employee already has a shift scheduled"
          onClose={() => { setConflict(null); }}
        >
          <div className="conflict-message">
            <Icon name="alert" size={24} />
            <p>{conflict.message}</p>
          </div>
          <div className="conflict-actions">
            <Button onClick={conflict.onIgnore}>Ignore</Button>
            <Button variant="primary" onClick={conflict.onReplace}>Replace existing</Button>
          </div>
        </Modal>
      )}

      {/* Assign Panel */}
      {assignPanel && (
        <div className="assign-overlay" onClick={() => setAssignPanel(null)}>
          <div className="assign-panel" onClick={(e) => e.stopPropagation()}>
            <div className="assign-panel-header">
              <div>
                <h3>Assign employee</h3>
                <p>{formatHour24(assignPanel.hour)} shift on {assignPanel.dateISO}</p>
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
                .filter((p) => parseInt(p.default_shift_start.split(":")[0]) !== assignPanel.hour || borrowMode)
                .filter((p) => p.name.toLowerCase().includes(assignSearch.toLowerCase()))
                .map((member) => {
                  const initials = member.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                  const memberGroup = groups.find((g) => g.id === member.group_id);
                  return (
                    <li key={member.id}>
                      <button className="assign-list-item" onClick={() => assignToOpenSlot(member, assignPanel.hour, assignPanel.dateISO)}>
                        <div className="assign-avatar">{initials}</div>
                        <div>
                          <strong>{member.name}</strong>
                          <span>{memberGroup?.name} · {compactShift(member.default_shift_start, member.default_shift_end)}</span>
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

      {/* FTE Budget Modal */}
      {editingFte && (
        <Modal
          title="Set FTE budget"
          subtitle={`For ${currentGroup?.name}`}
          onClose={() => setEditingFte(false)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setEditingFte(false)}>Cancel</Button>
                <Button variant="primary" onClick={saveFteBudget}>Save budget</Button>
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
    </div>
  );
}
