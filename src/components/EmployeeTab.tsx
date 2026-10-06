import { useEffect, useState, useMemo, useCallback } from "react";
import type { TeamMember, ShiftAssignment, AssignmentGroup, ScheduleNote, ScheduleHighlight, ViewType } from "../lib/types";
import * as data from "../lib/data";
import { Icon, Button } from "./ui";
import {
  GROUP_COLORS, getCurrentBiweeklyStart, getDateRange, formatDateRange, formatDateISO,
  dayNames, isWeekend, formatShiftDisplay, compactShift, hoursLabel, shiftDuration, formatDate,
} from "../lib/helpers";

interface ToastFn { (msg: string): void; }

export default function EmployeeTab({ toast }: { toast: ToastFn }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [highlights, setHighlights] = useState<ScheduleHighlight[]>([]);
  const [note, setNote] = useState<ScheduleNote | null>(null);
  const [noteText, setNoteText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewType, setViewType] = useState<ViewType>("bi-weekly");
  const [rangeStart, setRangeStart] = useState<Date>(getCurrentBiweeklyStart());
  const [lastPublished, setLastPublished] = useState<string>("");

  const dates = useMemo(() => getDateRange(viewType, rangeStart), [viewType, rangeStart]);
  const rangeEnd = dates[dates.length - 1];

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

      // Find latest published date across groups
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
        const a = await data.fetchPublishedAssignments(dates[0], rangeEnd);
        setAssignments(a);
      })();
    }
  }, [rangeStart, viewType]);

  const getShift = (memberId: string, dateISO: string): ShiftAssignment | undefined => {
    return assignments.find((a) => a.member_id === memberId && a.assignment_date === dateISO);
  };

  const isHighlighted = (memberId: string, dateISO: string) => {
    return highlights.some((h) => h.member_id === memberId && h.highlight_date === dateISO);
  };

  const toggleHighlight = async (memberId: string, dateISO: string) => {
    await data.toggleHighlight(memberId, dateISO);
    const h = await data.fetchHighlights();
    setHighlights(h);
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
      if (a && a.status === "Scheduled" && a.shift_start && a.shift_end) {
        const dur = shiftDuration(a.shift_start, a.shift_end);
        total += Math.max(0, dur - member.daily_unpaid_break);
      }
    }
    return Math.round(total * 10) / 10;
  };

  if (loading) return <div className="page"><p>Loading...</p></div>;

  const publishedMembers = members.filter((m) => m.status !== "Vacation" || assignments.some((a) => a.member_id === m.id && a.is_published));

  return (
    <div className="page">
      {error && <div className="error-banner"><Icon name="alert" size={16} /> {error}</div>}

      <section className="page-heading">
        <div>
          <div className="title-row">
            <h1>Employee schedule</h1>
            <span className="status-pill published">Published</span>
          </div>
          <p>Schedules are updated when you publish from the Staffing Matrix.</p>
        </div>
        <div className="heading-actions">
          <div className="view-toggle">
            <button className={viewType === "weekly" ? "active" : ""} onClick={() => setViewType("weekly")}>Weekly</button>
            <button className={viewType === "bi-weekly" ? "active" : ""} onClick={() => setViewType("bi-weekly")}>Bi-weekly</button>
            <button className={viewType === "monthly" ? "active" : ""} onClick={() => setViewType("monthly")}>Monthly</button>
          </div>
          <Button variant="primary" icon="print" onClick={() => window.print()}>Print schedule</Button>
        </div>
      </section>

      <div className="published-info-bar">
        <Icon name="calendar" size={16} />
        <span>Last published: <strong>{lastPublished || "Not yet published"}</strong></span>
        <span className="separator">·</span>
        <span>{formatDateRange(dates[0], rangeEnd)}</span>
      </div>

      <section className="print-card">
        <div className="print-header">
          <div>
            <span className="eyebrow">Patient Transportation</span>
            <h2>Team schedule</h2>
            <p>{formatDateRange(dates[0], rangeEnd)}</p>
          </div>
          <div className="print-brand">Shiftline</div>
        </div>

        {assignments.length === 0 ? (
          <div className="empty-state">
            <Icon name="calendar" size={32} />
            <h3>No published schedules yet</h3>
            <p>Publish schedules from the Staffing Matrix to see them here.</p>
          </div>
        ) : (
          <div className="employee-table-wrap">
            <table className="employee-table">
              <thead>
                <tr>
                  <th>Team member</th>
                  {dates.map((date) => (
                    <th key={formatDateISO(date)} className={isWeekend(date) ? "weekend" : ""}>
                      {dayNames[date.getDay()]}
                      <span>{formatDate(date)}</span>
                    </th>
                  ))}
                  <th>Total hours</th>
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
                        const highlighted = isHighlighted(member.id, dateISO);
                        const shiftLabel = a ? formatShiftDisplay(a.shift_start, a.shift_end, a.status) : "-";
                        return (
                          <td
                            key={dateISO}
                            className={`${a?.status === "Off" || !a ? "off" : ""} ${highlighted ? "highlighted" : ""} ${isWeekend(date) ? "weekend" : ""}`}
                            onClick={() => toggleHighlight(member.id, dateISO)}
                            title="Click to toggle highlight"
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

        <div className="print-note">
          <div className="note-header">
            <strong>Schedule notes</strong>
            <Button icon="save" onClick={saveNote}>Save note</Button>
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
