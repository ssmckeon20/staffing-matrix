import { useEffect, useState, useMemo, useCallback } from "react";
import type { TeamMember, ShiftAssignment, AssignmentGroup, ScheduleNote, ScheduleHighlight, ViewType } from "../lib/types";
import * as data from "../lib/data";
import { Icon, Button } from "./ui";
import {
  GROUP_COLORS, getDateRange, formatDateRange, formatDateISO, addDays,
  dayNames, isWeekend, formatShiftDisplay, hoursLabel, shiftDuration, formatDate,
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

export default function EmployeeTab({ toast, viewType, setViewType, rangeStart, setRangeStart, payPeriodStart }: { toast: ToastFn } & SharedDateProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [prevAssignments, setPrevAssignments] = useState<ShiftAssignment[]>([]);
  const [highlights, setHighlights] = useState<ScheduleHighlight[]>([]);
  const [note, setNote] = useState<ScheduleNote | null>(null);
  const [noteText, setNoteText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastPublished, setLastPublished] = useState<string>("");
  const [showGroupFilter, setShowGroupFilter] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [highlightChanges, setHighlightChanges] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem("highlightChanges") !== "false";
  });

  const dates = useMemo(() => getDateRange(viewType, rangeStart), [viewType, rangeStart]);
  const rangeEnd = dates[dates.length - 1];

  // Prior period for change detection
  const prevPeriodEnd = addDays(dates[0], -1);
  const prevPeriodStart = addDays(prevPeriodEnd, -(dates.length - 1));

  const loadAll = useCallback(async () => {
    try {
      const [m, g, a, h, n] = await Promise.all([
        data.fetchAllMembers(),
        data.fetchGroups(),
        data.fetchPublishedAssignments(dates[0], rangeEnd),
        data.fetchHighlights(),
        data.fetchScheduleNote(),
      ]);
      setMembers(m);
      setGroups(g);
      setAssignments(a);
      setHighlights(h);
      setNote(n);
      setNoteText(n?.note_text || "");
      setSelectedGroupIds(new Set(g.map((grp) => grp.id)));

      const prev = await data.fetchPublishedAssignments(prevPeriodStart, prevPeriodEnd);
      setPrevAssignments(prev);

      const allGroups = await Promise.all(g.map((grp) => data.fetchPublishedState(grp.id)));
      const publishedDates = allGroups.filter(Boolean).map((ps) => ps?.last_published_at).filter(Boolean);
      if (publishedDates.length > 0) {
        const latest = publishedDates.sort().reverse()[0];
        setLastPublished(new Date(latest).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (dates.length > 0) {
      (async () => {
        const [a, prev] = await Promise.all([
          data.fetchPublishedAssignments(dates[0], rangeEnd),
          data.fetchPublishedAssignments(prevPeriodStart, prevPeriodEnd),
        ]);
        setAssignments(a);
        setPrevAssignments(prev);
      })();
    }
  }, [rangeStart, viewType]); // eslint-disable-line react-hooks/exhaustive-deps

  const getShift = (memberId: string, dateISO: string): ShiftAssignment | undefined => {
    return assignments.find((a) => a.member_id === memberId && a.assignment_date === dateISO);
  };

  const getPrevShift = (memberId: string, dateISO: string): ShiftAssignment | undefined => {
    return prevAssignments.find((a) => a.member_id === memberId && a.assignment_date === dateISO);
  };

  // Detect changes from prior period by comparing week/day position
  const hasShiftChanged = (memberId: string, currentDate: Date): boolean => {
    const dateISO = formatDateISO(currentDate);
    const current = getShift(memberId, dateISO);
    const daysFromStart = Math.floor((currentDate.getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(daysFromStart / 7);
    const dayInWeek = daysFromStart % 7;
    const prevDate = addDays(prevPeriodStart, weekIndex * 7 + dayInWeek);
    const prevDateISO = formatDateISO(prevDate);
    const prev = getPrevShift(memberId, prevDateISO);
    if (!current && !prev) return false;
    if (!current || !prev) return true;
    if (current.status !== prev.status) return true;
    if (current.shift_start !== prev.shift_start) return true;
    if (current.shift_end !== prev.shift_end) return true;
    return false;
  };

  const isHighlighted = (memberId: string, dateISO: string) => {
    return highlights.some((h) => h.member_id === memberId && h.highlight_date === dateISO);
  };

  // Clicking a cell toggles a persisted highlight in the database
  const toggleHighlight = async (memberId: string, dateISO: string) => {
    await data.toggleHighlight(memberId, dateISO);
    const h = await data.fetchHighlights();
    setHighlights(h);
  };

  // A cell shows the change highlight when:
  // - highlightChanges is ON and the shift changed from prior period, OR
  // - the user manually highlighted it
  // A cell shows NO highlight when the user manually dismissed it (toggled highlight off)
  const cellShowsChangeHighlight = (memberId: string, date: Date): boolean => {
    const dateISO = formatDateISO(date);
    const changed = hasShiftChanged(memberId, date);
    if (!changed) return false;
    if (!highlightChanges) return false;
    // If user manually highlighted this cell, the manual highlight takes precedence
    if (isHighlighted(memberId, dateISO)) return false;
    return true;
  };

  const toggleHighlightChanges = (val: boolean) => {
    setHighlightChanges(val);
    if (typeof localStorage !== "undefined") localStorage.setItem("highlightChanges", String(val));
  };

  const saveNote = async () => {
    const n = await data.upsertScheduleNote(noteText);
    setNote(n);
    toast("Schedule note saved");
  };

  const memberTotalHours = (member: TeamMember): number => {
    let total = 0;
    for (const date of dates) {
      const dateISO = formatDateISO(date);
      const a = getShift(member.id, dateISO);
      if (a && (a.status === "Scheduled" || a.status === "Premium Pay") && a.shift_start && a.shift_end) {
        const dur = shiftDuration(a.shift_start, a.shift_end);
        const breakMins = a.shift_override_break != null ? a.shift_override_break : member.daily_unpaid_break;
        total += Math.max(0, dur - breakMins);
      }
    }
    return Math.round(total * 10) / 10;
  };

  const navigatePeriod = (direction: number) => {
    const step = viewType === "bi-weekly" ? 14 : viewType === "monthly" ? 30 : viewType === "daily" ? 1 : 7;
    setRangeStart(addDays(rangeStart, step * direction));
  };

  const shiftViewType = (newType: ViewType) => {
    setViewType(newType);
    const ppStart = new Date(payPeriodStart + "T00:00:00");
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - ppStart.getTime()) / (1000 * 60 * 60 * 24));
    const periodLen = newType === "bi-weekly" ? 14 : newType === "monthly" ? 30 : newType === "daily" ? 1 : 7;
    const periodsElapsed = Math.floor(diffDays / periodLen);
    setRangeStart(addDays(ppStart, periodsElapsed * periodLen));
  };

  const toggleGroupFilter = (groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;

  const visibleMembers = members.filter((m) => selectedGroupIds.has(m.group_id));
  const publishedMembers = visibleMembers.filter((m) =>
    m.status !== "Vacation" || assignments.some((a) => a.member_id === m.id && a.is_published)
  );

  const numWeeks = Math.ceil(dates.length / 7);

  return (
    <div className="page">
      {error && <div className="error-banner"><Icon name="alert" size={16} /> {error}</div>}

      <section className="page-heading">
        <div>
          <div className="title-row">
            <h1>Employee Schedule</h1>
            <span className="status-pill published">Published</span>
          </div>
          <p>Schedules Are Updated When You Publish From The Staffing Matrix.</p>
        </div>
        <div className="heading-actions">
          <Button variant="icon" icon="chevronLeft" onClick={() => navigatePeriod(-1)} />
          <button className="date-control">
            <Icon name="calendar" />
            <span>{formatDateRange(dates[0], rangeEnd)}</span>
            <Icon name="chevronDown" size={16} />
          </button>
          <Button variant="icon" icon="chevronRight" onClick={() => navigatePeriod(1)} />
          <div className="view-toggle">
            <button className={viewType === "daily" ? "active" : ""} onClick={() => shiftViewType("daily")}>Daily</button>
            <button className={viewType === "weekly" ? "active" : ""} onClick={() => shiftViewType("weekly")}>Weekly</button>
            <button className={viewType === "bi-weekly" ? "active" : ""} onClick={() => shiftViewType("bi-weekly")}>Bi-Weekly</button>
            <button className={viewType === "monthly" ? "active" : ""} onClick={() => shiftViewType("monthly")}>Monthly</button>
          </div>
          <Button variant="primary" icon="print" onClick={() => window.print()}>Print Schedule</Button>
        </div>
      </section>

      <div className="published-info-bar">
        <Icon name="calendar" size={16} />
        <span>Last published: <strong>{lastPublished || "Not yet published"}</strong></span>
        <span className="separator">·</span>
        <span>{formatDateRange(dates[0], rangeEnd)}</span>
        <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: "4px", marginLeft: "16px" }}>
          <input type="checkbox" checked={highlightChanges} onChange={(e) => toggleHighlightChanges(e.target.checked)} />
          <span>Highlight all schedule changes from prior period</span>
        </label>
        <div className="group-filter-dropdown" style={{ marginLeft: "auto" }}>
          <button className="group-filter-btn" onClick={() => setShowGroupFilter((v) => !v)}>
            <Icon name="team" size={14} />
            <span>Groups ({selectedGroupIds.size}/{groups.length})</span>
            <Icon name="chevronDown" size={12} />
          </button>
          {showGroupFilter && (
            <div className="group-filter-menu" onClick={(e) => e.stopPropagation()}>
              {groups.map((g) => (
                <label key={g.id} className="group-filter-item">
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.has(g.id)}
                    onChange={() => toggleGroupFilter(g.id)}
                  />
                  <span>{g.name}</span>
                </label>
              ))}
              <div style={{ borderTop: "1px solid var(--border-light)", marginTop: 4, paddingTop: 4, display: "flex", gap: 8 }}>
                <button className="group-filter-item" style={{ flex: 1, justifyContent: "center" }} onClick={() => setSelectedGroupIds(new Set(groups.map((g) => g.id)))}>
                  Select All
                </button>
                <button className="group-filter-item" style={{ flex: 1, justifyContent: "center" }} onClick={() => setSelectedGroupIds(new Set())}>
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="print-card">
        <div className="print-header">
          <div>
            <span className="eyebrow">Patient Transportation</span>
            <h2>Team Schedule</h2>
            <p>{formatDateRange(dates[0], rangeEnd)}</p>
          </div>
          <div className="print-brand">Shiftline</div>
        </div>

        {assignments.length === 0 ? (
          <div className="empty-state">
            <Icon name="calendar" size={32} />
            <h3>No Published Schedules Yet</h3>
            <p>Publish Schedules From The Staffing Matrix To See Them Here.</p>
          </div>
        ) : (
          <div className="employee-table-wrap">
            <table className="employee-table">
              <thead>
                {numWeeks > 1 && (
                  <tr className="week-band">
                    <th>Team Member</th>
                    {Array.from({ length: numWeeks }, (_, wi) => {
                      const wkStart = dates[wi * 7];
                      const wkEnd = dates[Math.min((wi + 1) * 7 - 1, dates.length - 1)];
                      return (
                        <th key={wi} colSpan={Math.min(7, dates.length - wi * 7)}>
                          Week {wi + 1} ({formatDate(wkStart)} – {formatDate(wkEnd)})
                        </th>
                      );
                    })}
                    <th>Total Hours</th>
                  </tr>
                )}
                <tr>
                  <th>Team Member</th>
                  {dates.map((date) => (
                    <th key={formatDateISO(date)} className={isWeekend(date) ? "weekend" : ""}>
                      {dayNames[date.getDay()]}
                      <span>{formatDate(date)}</span>
                    </th>
                  ))}
                  <th>Total Hours</th>
                </tr>
              </thead>
              <tbody>
                {publishedMembers.map((member) => {
                  const memberGroup = groups.find((g) => g.id === member.group_id);
                  const totalHrs = memberTotalHours(member);
                  const colorIdx = groups.findIndex((g) => g.id === member.group_id);
                  return (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.name}</strong>
                        <span className={`team-group-badge-sm ${GROUP_COLORS[colorIdx % GROUP_COLORS.length]}`}>{memberGroup?.name}</span>
                      </td>
                      {dates.map((date) => {
                        const dateISO = formatDateISO(date);
                        const a = getShift(member.id, dateISO);
                        const manualHighlight = isHighlighted(member.id, dateISO);
                        const autoChangeHighlight = cellShowsChangeHighlight(member.id, date);
                        const shiftLabel = a ? formatShiftDisplay(a.shift_start, a.shift_end, a.status) : "-";
                        const isLeaveStatus = a?.status === "PTO" || a?.status === "LOA" || a?.status === "Vacation";
                        const cellClass = a?.status === "Off" || !a ? "off" : isLeaveStatus ? "leave" : a?.status === "Premium Pay" ? "premium-pay" : "";
                        const showChangeHighlight = autoChangeHighlight && !manualHighlight;
                        return (
                          <td
                            key={dateISO}
                            className={`${cellClass} ${manualHighlight ? "highlighted" : ""} ${showChangeHighlight ? "change-highlighted" : ""} ${isWeekend(date) ? "weekend" : ""}`}
                            onClick={() => toggleHighlight(member.id, dateISO)}
                            title={showChangeHighlight ? "Schedule changed from previous period — click to toggle highlight" : "Click to toggle highlight"}
                          >
                            {shiftLabel}
                          </td>
                        );
                      })}
                      <td className="total-hours-cell"><strong>{hoursLabel(totalHrs)}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="print-color-key">
          <strong>Schedule Color Key:</strong>
          <span><i className="key-change" />Yellow highlight = schedule changed from previous period</span>
          <span><i className="key-leave" />Orange = PTO / LOA / Vacation</span>
          <span><i className="key-premium" />Purple = Premium Pay</span>
        </div>

        <div className="schedule-note-published">
          {note?.note_text ? (
            <>
              <strong>Schedule Notes</strong>
              <span>{note.note_text}</span>
            </>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>

        <div className="print-note">
          <div className="note-header">
            <strong>Schedule Notes</strong>
            <Button icon="save" onClick={saveNote}>Save Note</Button>
          </div>
          <textarea
            className="note-textarea"
            placeholder="Add custom comments that will appear with the schedule and on the printed version..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
          />
          <span className="note-hint">Please arrive 10 minutes before your shift. Contact the staffing office for changes or call-outs.</span>
        </div>
      </section>
    </div>
  );
}
