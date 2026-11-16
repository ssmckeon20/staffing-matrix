import { useEffect, useState, useCallback } from "react";
import type { AssignmentGroup, TeamMember, CompanyHoliday } from "../lib/types";
import * as data from "../lib/data";
import { useAuth } from "../lib/auth";
import { Icon, Button, Modal, ConfirmBanner, type IconName } from "./ui";
import { GROUP_COLORS, GROUP_COLOR_HEX, compactShift, inputToShiftTime, timeToInput, hoursLabel, formatDateISO } from "../lib/helpers";
import { detectHolidayName } from "../lib/holidayDetect";

export default function TeamTab() {
  const { canEdit } = useAuth();
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<AssignmentGroup | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupStart, setNewGroupStart] = useState("06:00");
  const [newGroupEnd, setNewGroupEnd] = useState("22:00");
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<AssignmentGroup | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editingMemberOriginalGroup, setEditingMemberOriginalGroup] = useState<string>("");
  const [memberSearch, setMemberSearch] = useState("");
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(false);
  const [pendingGroupChange, setPendingGroupChange] = useState<{ member: TeamMember; targetGroupId: string; targetGroupName: string; sourceGroupName: string; action: "member" | "group" } | null>(null);
  const [memberToAddId, setMemberToAddId] = useState("");
  const [error, setError] = useState("");

  // Holidays calendar state
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [renamingHoliday, setRenamingHoliday] = useState<CompanyHoliday | null>(null);

  // Add member form state
  const [mName, setMName] = useState("");
  const [mEmployeeId, setMEmployeeId] = useState("");
  const [mGroup, setMGroup] = useState("");
  const [mWeeklyHours, setMWeeklyHours] = useState(40);
  const [mBreak, setMBreak] = useState(0.5);
  const [mOvertime, setMOvertime] = useState(40);
  const [mRate, setMRate] = useState(0);
  const [mNotes, setMNotes] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [g, m, h] = await Promise.all([data.fetchGroups(), data.fetchAllMembers(), data.fetchCompanyHolidays()]);
      setGroups(g);
      setMembers(m);
      setHolidays(h);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const dutyClass = (groupId: string) => {
    const idx = groups.findIndex((g) => g.id === groupId);
    return GROUP_COLORS[idx % GROUP_COLORS.length] ?? "tc0";
  };

  const productiveCount = members.filter((m) => m.status === "Productive").length;
  const trainingCount = members.filter((m) => m.status === "Training").length;

  const resetMemberForm = () => {
    setMName(""); setMEmployeeId(""); setMGroup(groups[0]?.id ?? "");
    setMWeeklyHours(40); setMBreak(0.5); setMOvertime(40); setMRate(0); setMNotes("");
  };

  const handleCreateGroup = async () => {
    if (!canEdit) return;
    const name = newGroupName.trim();
    if (!name) return;
    try {
      await data.createGroup(name, newGroupStart, newGroupEnd);
      setCreatingGroup(false);
      setNewGroupName("");
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup || !canEdit) return;
    try {
      await data.updateGroup(editingGroup.id, {
        name: editingGroup.name,
        hours_of_service_start: editingGroup.hours_of_service_start,
        hours_of_service_end: editingGroup.hours_of_service_end,
      });
      await data.logChange(`Updated assignment group "${editingGroup.name}"`, "Group");
      setEditingGroup(null);
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const handleDeleteGroup = async () => {
    if (!confirmDeleteGroup || !canEdit) return;
    try {
      await data.deleteGroup(confirmDeleteGroup.id, confirmDeleteGroup.name);
      setConfirmDeleteGroup(null);
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const handleAddMember = async () => {
    if (!canEdit) return;
    if (!mName.trim() || !mGroup) return;
    try {
      await data.createMember({
        group_id: mGroup,
        name: mName.trim(),
        employee_id: mEmployeeId.trim() || null,
        status: "Productive",
        expected_weekly_hours: mWeeklyHours,
        daily_unpaid_break: mBreak,
        overtime_threshold: mOvertime,
        hourly_rate: mRate,
        notes: mNotes.trim() || null,
      });
      setAddingMember(false);
      resetMemberForm();
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const handleSaveMember = async () => {
    if (!editingMember || !canEdit) return;
    if (editingMember.group_id !== editingMemberOriginalGroup) {
      const sourceGroup = groups.find((g) => g.id === editingMemberOriginalGroup);
      const targetGroup = groups.find((g) => g.id === editingMember.group_id);
      setPendingGroupChange({
        member: editingMember,
        targetGroupId: editingMember.group_id,
        targetGroupName: targetGroup?.name || "",
        sourceGroupName: sourceGroup?.name || "another group",
        action: "member",
      });
      return;
    }
    await doSaveMember();
  };

  const doSaveMember = async () => {
    if (!editingMember || !canEdit) return;
    try {
      await data.updateMember(editingMember.id, {
        name: editingMember.name,
        employee_id: editingMember.employee_id?.trim() || null,
        group_id: editingMember.group_id,
        expected_weekly_hours: editingMember.expected_weekly_hours,
        daily_unpaid_break: editingMember.daily_unpaid_break,
        overtime_threshold: editingMember.overtime_threshold,
        hourly_rate: editingMember.hourly_rate || 0,
        notes: editingMember.notes?.trim() || null,
      });
      await data.logChange(`Updated team member "${editingMember.name}"`, "Team");
      setEditingMember(null);
      setConfirmRemoveMember(false);
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const handleRemoveMember = async () => {
    if (!editingMember || !canEdit) return;
    try {
      await data.deleteMember(editingMember.id, editingMember.name);
      setEditingMember(null);
      setConfirmRemoveMember(false);
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const openMemberEdit = (member: TeamMember) => {
    setEditingMember({ ...member });
    setEditingMemberOriginalGroup(member.group_id);
    setConfirmRemoveMember(false);
  };

  const holidayByDate = (dateISO: string) => holidays.find((h) => h.holiday_date === dateISO);

  const toggleHoliday = async (date: Date) => {
    if (!canEdit) return;
    const dateISO = formatDateISO(date);
    const existing = holidayByDate(dateISO);
    try {
      if (existing) {
        await data.deleteCompanyHoliday(dateISO);
        setHolidays((prev) => prev.filter((h) => h.holiday_date !== dateISO));
      } else {
        const name = detectHolidayName(date) || "Holiday";
        const saved = await data.upsertCompanyHoliday(dateISO, name);
        setHolidays((prev) => [...prev, saved].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)));
        setRenamingHoliday(saved);
      }
    } catch (e) { setError(String(e)); }
  };

  const saveHolidayName = async () => {
    if (!renamingHoliday || !canEdit) return;
    const name = renamingHoliday.name.trim() || "Holiday";
    try {
      const saved = await data.upsertCompanyHoliday(renamingHoliday.holiday_date, name);
      setHolidays((prev) => prev.map((h) => (h.holiday_date === saved.holiday_date ? saved : h)));
      setRenamingHoliday(null);
    } catch (e) { setError(String(e)); }
  };

  const calYear = calMonth.getFullYear();
  const calMonthIdx = calMonth.getMonth();
  const firstWeekday = new Date(calYear, calMonthIdx, 1).getDay();
  const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
  const calCells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(calYear, calMonthIdx, i + 1)),
  ];
  const monthName = calMonth.toLocaleString("en-US", { month: "long", year: "numeric" });
  const upcomingHolidays = holidays
    .filter((h) => new Date(h.holiday_date + "T00:00:00") >= new Date(new Date().toDateString()))
    .slice(0, 6);

  if (loading) return <div className="page"><p>Loading...</p></div>;

  return (
    <div className="page">
      {error && <div className="error-banner"><Icon name="alert" size={16} /> {error}</div>}

      <section className="page-heading">
        <div>
          <div className="title-row">
            <h1>Team</h1>
            <span className="status-pill">{members.length} members</span>
          </div>
          <p>Manage Team Members, Assignment Groups, And Onboarding Status. Changes Are Saved Automatically.</p>
        </div>
        <div className="heading-actions">
          <Button icon="upload" onClick={() => alert("Excel roster import coming soon")}>Import roster</Button>
          <Button variant="primary" icon="plus" onClick={() => { resetMemberForm(); setAddingMember(true); }}>Add team member</Button>
        </div>
      </section>

      <section className="metrics">
        <article className="metric">
          <div className="metric-top"><span>Total Members</span></div>
          <div className="metric-value">{members.length}</div>
          <small>Across All Groups</small>
        </article>
        <article className="metric">
          <div className="metric-top"><span>Productive</span><span className="trend good">{Math.round((productiveCount / Math.max(1, members.length)) * 100)}%</span></div>
          <div className="metric-value">{productiveCount}</div>
          <small>Active And On Duty</small>
        </article>
        <article className="metric">
          <div className="metric-top"><span>In Training</span></div>
          <div className="metric-value">{trainingCount}</div>
          <small>Non-Productive, Excluded From Coverage</small>
        </article>
        <article className="metric">
          <div className="metric-top"><span>Assignment Groups</span></div>
          <div className="metric-value">{groups.length}</div>
          <small>Job Duty Groups</small>
        </article>
      </section>

      {/* Assignment Groups Section */}
      <div className="team-mgmt-section">
        <div className="team-mgmt-header">
          <h3>Assignment Groups</h3>
          <button className="team-create-btn" onClick={() => { setCreatingGroup(true); setNewGroupName(""); setNewGroupStart("06:00"); setNewGroupEnd("22:00"); }}>
            <Icon name="plus" size={13} />New Group
          </button>
        </div>
        <div className="team-chips-row">
          {groups.map((g, i) => (
            <div key={g.id} className={`team-chip-item ${GROUP_COLORS[i % GROUP_COLORS.length]}`}>
              <span className="team-chip-name" onClick={() => setEditingGroup({ ...g })}>{g.name}</span>
              <span className="team-chip-count">{members.filter((m) => m.group_id === g.id).length}</span>
              <button className="team-chip-delete" onClick={() => setConfirmDeleteGroup(g)} title="Delete Group">
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          {creatingGroup && (
            <div className="team-chip-item tc-new">
              <input
                className="team-rename-input"
                placeholder="Group name..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateGroup(); if (e.key === "Escape") setCreatingGroup(false); }}
                autoFocus
              />
              <button className="team-chip-action save" onClick={handleCreateGroup}>Add</button>
              <button className="team-chip-action cancel" onClick={() => setCreatingGroup(false)}><Icon name="x" size={12} /></button>
            </div>
          )}
        </div>
      </div>

      {/* Company Holidays Section */}
      <div className="team-mgmt-section">
        <div className="team-mgmt-header">
          <h3>Company Holidays</h3>
          <span className="team-group-count">{holidays.length} defined</span>
        </div>
        <div className="holiday-layout">
          <div className="holiday-cal">
            <div className="holiday-cal-header">
              <button className="holiday-nav-btn" onClick={() => setCalMonth(new Date(calYear, calMonthIdx - 1, 1))} aria-label="Previous month">
                <Icon name="chevronLeft" size={14} />
              </button>
              <strong>{monthName}</strong>
              <button className="holiday-nav-btn" onClick={() => setCalMonth(new Date(calYear, calMonthIdx + 1, 1))} aria-label="Next month">
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
            <div className="holiday-cal-grid">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <span key={i} className="holiday-cal-dow">{d}</span>
              ))}
              {calCells.map((date, i) => {
                if (!date) return <span key={`blank-${i}`} />;
                const dateISO = formatDateISO(date);
                const holiday = holidayByDate(dateISO);
                return (
                  <button
                    key={dateISO}
                    className={`holiday-cal-day ${holiday ? "is-holiday" : ""}`}
                    onClick={() => toggleHoliday(date)}
                    title={holiday ? `${holiday.name} — click to remove` : "Click to mark as holiday"}
                  >
                    {date.getDate()}
                    {holiday && <small>{holiday.name}</small>}
                  </button>
                );
              })}
            </div>
            <p className="holiday-cal-hint">Click a date to mark it as a company holiday. Click again to remove it. The system suggests common US holiday names — you can rename any holiday below.</p>
          </div>
          <div className="holiday-list">
            <strong>Defined Holidays</strong>
            {holidays.length === 0 && <p className="team-empty">No holidays defined yet.</p>}
            {holidays.map((h) => (
              <div key={h.id} className="holiday-list-item">
                <button className="holiday-list-name" onClick={() => setRenamingHoliday(h)} title="Rename holiday">
                  {h.name}
                </button>
                <span className="holiday-list-date">{new Date(h.holiday_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
                <button className="team-chip-delete" onClick={async () => {
                  try {
                    await data.deleteCompanyHoliday(h.holiday_date);
                    setHolidays((prev) => prev.filter((x) => x.holiday_date !== h.holiday_date));
                  } catch (e) { setError(String(e)); }
                }} title="Remove holiday"><Icon name="x" size={12} /></button>
              </div>
            ))}
            {upcomingHolidays.length > 0 && (
              <p className="holiday-upcoming-hint">
                Next up: {upcomingHolidays.map((h) => `${h.name} (${new Date(h.holiday_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})`).join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Member Search */}
      <div className="team-search-bar">
        <Icon name="search" size={16} />
        <input placeholder="Search team members..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
      </div>

      {/* Members grouped by assignment */}
      {groups.map((group) => {
        const groupMembers = members.filter((m) =>
          m.group_id === group.id &&
          (!memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase()))
        );
        if (groupMembers.length === 0 && memberSearch) return null;
        return (
          <section key={group.id} className="team-group">
            <div className="team-group-header">
              <span className={`team-group-badge ${dutyClass(group.id)}`} onClick={() => setEditingGroup({ ...group })}>{group.name}</span>
              <span className="team-group-count">{groupMembers.length} member{groupMembers.length !== 1 ? "s" : ""}</span>
              <button className="text-action" onClick={() => setEditingGroup({ ...group })}>
                <Icon name="edit" size={13} /> Edit group
              </button>
            </div>
            <div className="team-member-list">
              {groupMembers.length === 0 ? (
                <div className="team-empty">No members in this group yet.</div>
              ) : groupMembers.map((member) => {
                const initials = member.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <div key={member.id} className="team-member-card" onClick={() => openMemberEdit(member)}>
                    <div className={`team-avatar ${dutyClass(member.group_id)}`}>{initials}</div>
                    <div className="team-member-info">
                      <strong>{member.name}</strong>
                      <span className="team-member-meta">
                        OT after {member.overtime_threshold} hrs
                      </span>
                    </div>
                    <button className="team-remove-btn" onClick={(e) => { e.stopPropagation(); setEditingMember(member); setConfirmRemoveMember(true); }} title={`Remove ${member.name}`}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {groups.length === 0 && !creatingGroup && (
        <div className="team-empty" style={{ marginTop: "20px" }}>No assignment groups yet. Create one to get started.</div>
      )}

      {/* Add Member Modal */}
      {addingMember && (
        <Modal
          title="Add Team Member"
          subtitle="New Members Start With No Shifts — Assign Them In The Staffing Matrix."
          onClose={() => setAddingMember(false)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setAddingMember(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleAddMember}>Add Member</Button>
              </div>
            </>
          }
        >
          <label>Full Name
            <input placeholder="e.g. Jordan Lee" value={mName} onChange={(e) => setMName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddMember()} autoFocus />
          </label>
          <label>Employee ID
            <input placeholder="e.g. EMP-0142" value={mEmployeeId} onChange={(e) => setMEmployeeId(e.target.value)} />
          </label>
          <label>Assignment Group
            <select value={mGroup} onChange={(e) => setMGroup(e.target.value)}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <div className="form-row-2">
            <label>Expected Weekly Hours
              <input type="number" min="0" step="1" value={mWeeklyHours} onChange={(e) => setMWeeklyHours(Number(e.target.value) || 0)} />
            </label>
            <label>Daily Unpaid Break (Hours)
              <input type="number" min="0" step="0.25" value={mBreak} onChange={(e) => setMBreak(Number(e.target.value) || 0)} />
            </label>
          </div>
          <label>Overtime At (Hours Over)
            <input type="number" min="0" step="1" value={mOvertime} onChange={(e) => setMOvertime(Number(e.target.value) || 0)} />
          </label>
          <label>Hourly Rate ($)
            <input type="number" min="0" step="0.01" value={mRate} onChange={(e) => setMRate(Number(e.target.value) || 0)} />
          </label>
          <label>Notes
            <textarea
              placeholder="Availability considerations for AI-assisted scheduling, e.g. must have every Tuesday off, prefers earlier weekend shifts..."
              rows={3}
              value={mNotes}
              onChange={(e) => setMNotes(e.target.value)}
            />
          </label>
        </Modal>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <Modal
          title="Edit Team Member"
          subtitle="Update Assignment Group And Overtime Settings."
          onClose={() => { setEditingMember(null); setConfirmRemoveMember(false); }}
          footer={
            confirmRemoveMember ? null : (
              <>
                <button className="btn-remove-shift" onClick={() => setConfirmRemoveMember(true)}>Remove from team</button>
                <div className="modal-actions-right">
                  <Button onClick={() => { setEditingMember(null); setConfirmRemoveMember(false); }}>Cancel</Button>
                  <Button variant="primary" onClick={handleSaveMember}>Save Changes</Button>
                </div>
              </>
            )
          }
        >
          <label>Full Name
            <input value={editingMember.name} onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })} />
          </label>
          <label>Employee ID
            <input value={editingMember.employee_id || ""} onChange={(e) => setEditingMember({ ...editingMember, employee_id: e.target.value })} />
          </label>
          <label>Assignment Group
            <select value={editingMember.group_id} onChange={(e) => setEditingMember({ ...editingMember, group_id: e.target.value })}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <div className="form-row-2">
            <label>Expected Weekly Hours
              <input type="number" min="0" step="1" value={editingMember.expected_weekly_hours} onChange={(e) => setEditingMember({ ...editingMember, expected_weekly_hours: Number(e.target.value) || 0 })} />
            </label>
            <label>Daily Unpaid Break (Hours)
              <input type="number" min="0" step="0.25" value={editingMember.daily_unpaid_break} onChange={(e) => setEditingMember({ ...editingMember, daily_unpaid_break: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <label>Overtime At (Hours Over)
            <input type="number" min="0" step="1" value={editingMember.overtime_threshold} onChange={(e) => setEditingMember({ ...editingMember, overtime_threshold: Number(e.target.value) || 0 })} />
          </label>
          <label>Hourly Rate ($)
            <input type="number" min="0" step="0.01" value={editingMember.hourly_rate || 0} onChange={(e) => setEditingMember({ ...editingMember, hourly_rate: Number(e.target.value) || 0 })} />
          </label>
          <label>Notes
            <textarea
              placeholder="Availability considerations for AI-assisted scheduling, e.g. must have every Tuesday off, prefers earlier weekend shifts..."
              rows={3}
              value={editingMember.notes || ""}
              onChange={(e) => setEditingMember({ ...editingMember, notes: e.target.value })}
            />
          </label>
          {pendingGroupChange && pendingGroupChange.action === "member" && (
            <ConfirmBanner
              message={<>{pendingGroupChange.member.name} is currently assigned to <strong>{pendingGroupChange.sourceGroupName}</strong>. Move them to <strong>{pendingGroupChange.targetGroupName}</strong>? They will be removed from their current group.</>}
              onCancel={() => setPendingGroupChange(null)}
              onConfirm={async () => {
                await data.updateMember(pendingGroupChange.member.id, { group_id: pendingGroupChange.targetGroupId });
                await data.logChange(`Moved ${pendingGroupChange.member.name} from ${pendingGroupChange.sourceGroupName} to ${pendingGroupChange.targetGroupName}`, "Team");
                setPendingGroupChange(null);
                setEditingMember(null);
                setConfirmRemoveMember(false);
                await loadAll();
              }}
              cancelLabel="No, keep current"
              confirmLabel="Yes, reassign"
            />
          )}
          {confirmRemoveMember && (
            <ConfirmBanner
              message={<>Remove <strong>{editingMember.name}</strong> from the team? This cannot be undone.</>}
              onCancel={() => setConfirmRemoveMember(false)}
              onConfirm={handleRemoveMember}
              cancelLabel="Keep member"
              confirmLabel="Yes, remove"
            />
          )}
        </Modal>
      )}

      {/* Create/Edit Group Modal */}
      {creatingGroup && (
        <Modal
          title="New Assignment Group"
          subtitle="Groups Organize Staff By Job Duty With Their Own Hours And Overtime Rules."
          onClose={() => setCreatingGroup(false)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setCreatingGroup(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleCreateGroup}>Create Group</Button>
              </div>
            </>
          }
        >
          <label>Group Name
            <input placeholder="e.g. Emergency Department Transporter" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()} />
          </label>
          <label>Hours Of Operation
            <div className="shift-time-inputs">
              <div className="shift-time-field"><span>Start</span><input type="time" value={newGroupStart} onChange={(e) => setNewGroupStart(e.target.value)} /></div>
              <span className="shift-time-sep">to</span>
              <div className="shift-time-field"><span>End</span><input type="time" value={newGroupEnd} onChange={(e) => setNewGroupEnd(e.target.value)} /></div>
            </div>
          </label>
        </Modal>
      )}

      {editingGroup && (
        <Modal
          title="Edit Assignment Group"
          subtitle="Update Hours And Manage Assigned Members."
          onClose={() => setEditingGroup(null)}
          footer={
            <>
              <button className="btn-remove-shift" onClick={() => { setConfirmDeleteGroup(editingGroup); }}>Delete Group</button>
              <div className="modal-actions-right">
                <Button onClick={() => setEditingGroup(null)}>Cancel</Button>
                <Button variant="primary" onClick={handleUpdateGroup}>Save changes</Button>
              </div>
            </>
          }
        >
          <label>Group Name
            <input value={editingGroup.name} onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })} />
          </label>
          <label>Hours Of Operation
            <div className="shift-time-inputs">
              <div className="shift-time-field"><span>Start</span><input type="time" value={editingGroup.hours_of_service_start} onChange={(e) => setEditingGroup({ ...editingGroup, hours_of_service_start: e.target.value })} /></div>
              <span className="shift-time-sep">to</span>
              <div className="shift-time-field"><span>End</span><input type="time" value={editingGroup.hours_of_service_end} onChange={(e) => setEditingGroup({ ...editingGroup, hours_of_service_end: e.target.value })} /></div>
            </div>
          </label>
          <div className="group-members-list">
            <strong>Assigned members ({members.filter((m) => m.group_id === editingGroup.id).length})</strong>
            <div className="group-members-inner">
              {members.filter((m) => m.group_id === editingGroup.id).map((m) => (
                <div key={m.id} className="group-member-row">
                  <span>{m.name}</span>
                  <button className="group-member-remove" onClick={() => {
                    const otherGroup = groups.find((g) => g.id !== editingGroup.id);
                    if (otherGroup) {
                      setPendingGroupChange({
                        member: m,
                        targetGroupId: otherGroup.id,
                        targetGroupName: otherGroup.name,
                        sourceGroupName: editingGroup.name,
                        action: "group",
                      });
                    }
                  }} title="Remove from group"><Icon name="x" size={12} /></button>
                </div>
              ))}
              {members.filter((m) => m.group_id === editingGroup.id).length === 0 && (
                <div className="team-empty">No members assigned to this group.</div>
              )}
            </div>
            <div className="group-add-member-row">
              <select value={memberToAddId} onChange={(e) => setMemberToAddId(e.target.value)}>
                <option value="">Add existing member to this group...</option>
                {members.filter((m) => m.group_id !== editingGroup.id).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <Button variant="primary" icon="plus" onClick={() => {
                if (!memberToAddId || !editingGroup) return;
                const member = members.find((m) => m.id === memberToAddId);
                if (!member) return;
                const sourceGroup = groups.find((g) => g.id === member.group_id);
                setPendingGroupChange({
                  member,
                  targetGroupId: editingGroup.id,
                  targetGroupName: editingGroup.name,
                  sourceGroupName: sourceGroup?.name || "another group",
                  action: "group",
                });
                setMemberToAddId("");
              }}>Add</Button>
            </div>
          </div>
          {pendingGroupChange && (
            <ConfirmBanner
              message={<>{pendingGroupChange.member.name} is currently assigned to <strong>{pendingGroupChange.sourceGroupName}</strong>. Move them to <strong>{pendingGroupChange.targetGroupName}</strong>? They will be removed from their current group.</>}
              onCancel={() => setPendingGroupChange(null)}
              onConfirm={async () => {
                await data.updateMember(pendingGroupChange.member.id, { group_id: pendingGroupChange.targetGroupId });
                await data.logChange(`Moved ${pendingGroupChange.member.name} from ${pendingGroupChange.sourceGroupName} to ${pendingGroupChange.targetGroupName}`, "Group");
                setPendingGroupChange(null);
                await loadAll();
                setEditingGroup((prev) => prev ? { ...prev } : null);
              }}
              cancelLabel="No, keep current"
              confirmLabel="Yes, reassign"
            />
          )}
          {confirmDeleteGroup && (
            <ConfirmBanner
              message={<>Delete assignment group <strong>"{confirmDeleteGroup.name}"</strong>? All members will lose their group assignment. This cannot be undone.</>}
              onCancel={() => setConfirmDeleteGroup(null)}
              onConfirm={handleDeleteGroup}
              cancelLabel="Keep group"
              confirmLabel="Yes, delete"
            />
          )}
        </Modal>
      )}
      {/* Rename Holiday Modal */}
      {renamingHoliday && (
        <Modal
          title="Name This Holiday"
          subtitle={new Date(renamingHoliday.holiday_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          onClose={() => setRenamingHoliday(null)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setRenamingHoliday(null)}>Cancel</Button>
                <Button variant="primary" onClick={saveHolidayName}>Save Name</Button>
              </div>
            </>
          }
        >
          <label>Holiday Name
            <input
              value={renamingHoliday.name}
              onChange={(e) => setRenamingHoliday({ ...renamingHoliday, name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveHolidayName()}
              autoFocus
            />
          </label>
          <p className="holiday-modal-hint">This name will appear above the date column in the By Shift grid and on the posted, printable Employee Schedule.</p>
        </Modal>
      )}
    </div>
  );
}
