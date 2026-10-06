import { useEffect, useState, useCallback } from "react";
import type { AssignmentGroup, TeamMember, MemberStatus } from "../lib/types";
import * as data from "../lib/data";
import { Icon, Button, Modal, ConfirmBanner, type IconName } from "./ui";
import { GROUP_COLORS, GROUP_COLOR_HEX, compactShift, inputToShiftTime, timeToInput, hoursLabel, shiftDuration } from "../lib/helpers";

const STATUS_OPTIONS: MemberStatus[] = ["Productive", "Training", "Vacation"];

export default function TeamTab() {
  const [groups, setGroups] = useState<AssignmentGroup[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingGroup, setEditingGroup] = useState<AssignmentGroup | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupStart, setNewGroupStart] = useState("06:00");
  const [newGroupEnd, setNewGroupEnd] = useState("22:00");
  const [newGroupOvertimeThreshold, setNewGroupOvertimeThreshold] = useState(40);
  const [newGroupOvertimeMultiplier, setNewGroupOvertimeMultiplier] = useState(1.5);
  const [newGroupBaseRate, setNewGroupBaseRate] = useState(0);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<AssignmentGroup | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(false);
  const [error, setError] = useState("");

  // Add member form state
  const [mName, setMName] = useState("");
  const [mGroup, setMGroup] = useState("");
  const [mStatus, setMStatus] = useState<MemberStatus>("Productive");
  const [mStart, setMStart] = useState("07:00");
  const [mEnd, setMEnd] = useState("15:30");
  const [mWeeklyHours, setMWeeklyHours] = useState(40);
  const [mBreak, setMBreak] = useState(0.5);
  const [mRate, setMRate] = useState(0);
  const [mPremium, setMPremium] = useState(false);
  const [mPremiumRate, setMPremiumRate] = useState(0);
  const [mPremiumStart, setMPremiumStart] = useState("");
  const [mPremiumEnd, setMPremiumEnd] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([data.fetchGroups(), data.fetchAllMembers()]);
      setGroups(g);
      setMembers(m);
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
    setMName(""); setMGroup(groups[0]?.id ?? ""); setMStatus("Productive");
    setMStart("07:00"); setMEnd("15:30"); setMWeeklyHours(40); setMBreak(0.5);
    setMRate(0); setMPremium(false); setMPremiumRate(0);
    setMPremiumStart(""); setMPremiumEnd("");
  };

  const handleCreateGroup = async () => {
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
    if (!editingGroup) return;
    try {
      await data.updateGroup(editingGroup.id, {
        name: editingGroup.name,
        hours_of_service_start: editingGroup.hours_of_service_start,
        hours_of_service_end: editingGroup.hours_of_service_end,
        overtime_threshold: editingGroup.overtime_threshold,
        overtime_rate_multiplier: editingGroup.overtime_rate_multiplier,
        base_hourly_rate: editingGroup.base_hourly_rate,
      });
      await data.logChange(`Updated assignment group "${editingGroup.name}"`, "Group");
      setEditingGroup(null);
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const handleDeleteGroup = async () => {
    if (!confirmDeleteGroup) return;
    try {
      await data.deleteGroup(confirmDeleteGroup.id, confirmDeleteGroup.name);
      setConfirmDeleteGroup(null);
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const handleAddMember = async () => {
    if (!mName.trim() || !mGroup) return;
    try {
      await data.createMember({
        group_id: mGroup,
        name: mName.trim(),
        status: mStatus,
        default_shift_start: mStart,
        default_shift_end: mEnd,
        expected_weekly_hours: mWeeklyHours,
        daily_unpaid_break: mBreak,
        hourly_rate: mRate,
        premium_pay_enabled: mPremium,
        premium_rate: mPremiumRate,
        premium_start_date: mPremiumStart || null,
        premium_end_date: mPremiumEnd || null,
      });
      setAddingMember(false);
      resetMemberForm();
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const handleSaveMember = async () => {
    if (!editingMember) return;
    try {
      await data.updateMember(editingMember.id, {
        name: editingMember.name,
        group_id: editingMember.group_id,
        status: editingMember.status,
        default_shift_start: editingMember.default_shift_start,
        default_shift_end: editingMember.default_shift_end,
        expected_weekly_hours: editingMember.expected_weekly_hours,
        daily_unpaid_break: editingMember.daily_unpaid_break,
        hourly_rate: editingMember.hourly_rate,
        premium_pay_enabled: editingMember.premium_pay_enabled,
        premium_rate: editingMember.premium_rate,
        premium_start_date: editingMember.premium_start_date,
        premium_end_date: editingMember.premium_end_date,
      });
      await data.logChange(`Updated team member "${editingMember.name}"`, "Team");
      setEditingMember(null);
      setConfirmRemoveMember(false);
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const handleRemoveMember = async () => {
    if (!editingMember) return;
    try {
      await data.deleteMember(editingMember.id, editingMember.name);
      setEditingMember(null);
      setConfirmRemoveMember(false);
      await loadAll();
    } catch (e) { setError(String(e)); }
  };

  const openMemberEdit = (member: TeamMember) => {
    setEditingMember({ ...member });
    setConfirmRemoveMember(false);
  };

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
          <p>Manage team members, assignment groups, and onboarding status. Changes are saved automatically.</p>
        </div>
        <div className="heading-actions">
          <Button icon="upload" onClick={() => alert("Excel roster import coming soon")}>Import roster</Button>
          <Button variant="primary" icon="plus" onClick={() => { resetMemberForm(); setAddingMember(true); }}>Add team member</Button>
        </div>
      </section>

      <section className="metrics">
        <article className="metric">
          <div className="metric-top"><span>Total members</span></div>
          <div className="metric-value">{members.length}</div>
          <small>Across all groups</small>
        </article>
        <article className="metric">
          <div className="metric-top"><span>Productive</span><span className="trend good">{Math.round((productiveCount / Math.max(1, members.length)) * 100)}%</span></div>
          <div className="metric-value">{productiveCount}</div>
          <small>Active and on duty</small>
        </article>
        <article className="metric">
          <div className="metric-top"><span>In training</span></div>
          <div className="metric-value">{trainingCount}</div>
          <small>Non-productive, excluded from coverage</small>
        </article>
        <article className="metric">
          <div className="metric-top"><span>Assignment groups</span></div>
          <div className="metric-value">{groups.length}</div>
          <small>Job duty groups</small>
        </article>
      </section>

      {/* Assignment Groups Section */}
      <div className="team-mgmt-section">
        <div className="team-mgmt-header">
          <h3>Assignment Groups</h3>
          <button className="team-create-btn" onClick={() => { setCreatingGroup(true); setNewGroupName(""); setNewGroupStart("06:00"); setNewGroupEnd("22:00"); setNewGroupOvertimeThreshold(40); setNewGroupOvertimeMultiplier(1.5); setNewGroupBaseRate(0); }}>
            <Icon name="plus" size={13} />New group
          </button>
        </div>
        <div className="team-chips-row">
          {groups.map((g, i) => (
            <div key={g.id} className={`team-chip-item ${GROUP_COLORS[i % GROUP_COLORS.length]}`}>
              <span className="team-chip-name" onClick={() => setEditingGroup({ ...g })}>{g.name}</span>
              <span className="team-chip-count">{members.filter((m) => m.group_id === g.id).length}</span>
              <button className="team-chip-delete" onClick={() => setConfirmDeleteGroup(g)} title="Delete group">
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
                const shiftHrs = shiftDuration(member.default_shift_start, member.default_shift_end) - member.daily_unpaid_break;
                const initials = member.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <div key={member.id} className="team-member-card" onClick={() => openMemberEdit(member)}>
                    <div className={`team-avatar ${dutyClass(member.group_id)}`}>{initials}</div>
                    <div className="team-member-info">
                      <strong>{member.name}</strong>
                      <span className="team-member-meta">
                        {compactShift(member.default_shift_start, member.default_shift_end)} · {hoursLabel(shiftHrs > 0 ? shiftHrs * 5 : 0)} this period
                      </span>
                    </div>
                    <span className={`team-status-badge ${(member.status || "productive").toLowerCase()}`}>{member.status}</span>
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
          title="Add team member"
          subtitle="New members start with no shifts — assign them in the Staffing Matrix."
          onClose={() => setAddingMember(false)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setAddingMember(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleAddMember}>Add member</Button>
              </div>
            </>
          }
        >
          <label>Full name
            <input placeholder="e.g. Jordan Lee" value={mName} onChange={(e) => setMName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddMember()} autoFocus />
          </label>
          <label>Assignment group
            <select value={mGroup} onChange={(e) => setMGroup(e.target.value)}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label>Status
            <select value={mStatus} onChange={(e) => setMStatus(e.target.value as MemberStatus)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Default shift
            <div className="shift-time-inputs">
              <div className="shift-time-field"><span>Start</span><input type="time" value={mStart} onChange={(e) => setMStart(e.target.value)} /></div>
              <span className="shift-time-sep">→</span>
              <div className="shift-time-field"><span>End</span><input type="time" value={mEnd} onChange={(e) => setMEnd(e.target.value)} /></div>
            </div>
          </label>
          <div className="form-row-2">
            <label>Expected weekly hours
              <input type="number" min="0" step="1" value={mWeeklyHours} onChange={(e) => setMWeeklyHours(Number(e.target.value) || 0)} />
            </label>
            <label>Daily unpaid break (hours)
              <input type="number" min="0" step="0.25" value={mBreak} onChange={(e) => setMBreak(Number(e.target.value) || 0)} />
            </label>
          </div>
          <label>Hourly rate ($)
            <input type="number" min="0" step="0.01" value={mRate} onChange={(e) => setMRate(Number(e.target.value) || 0)} />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={mPremium} onChange={(e) => setMPremium(e.target.checked)} />
            <span>Premium pay enabled</span>
          </label>
          {mPremium && (
            <div className="premium-fields">
              <label>Premium rate ($)
                <input type="number" min="0" step="0.01" value={mPremiumRate} onChange={(e) => setMPremiumRate(Number(e.target.value) || 0)} />
              </label>
              <div className="form-row-2">
                <label>Premium start date
                  <input type="date" value={mPremiumStart} onChange={(e) => setMPremiumStart(e.target.value)} />
                </label>
                <label>Premium end date
                  <input type="date" value={mPremiumEnd} onChange={(e) => setMPremiumEnd(e.target.value)} />
                </label>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <Modal
          title="Edit team member"
          subtitle="Update assignment group, status, shift, and pay details."
          onClose={() => { setEditingMember(null); setConfirmRemoveMember(false); }}
          footer={
            confirmRemoveMember ? null : (
              <>
                <button className="btn-remove-shift" onClick={() => setConfirmRemoveMember(true)}>Remove from team</button>
                <div className="modal-actions-right">
                  <Button onClick={() => { setEditingMember(null); setConfirmRemoveMember(false); }}>Cancel</Button>
                  <Button variant="primary" onClick={handleSaveMember}>Save changes</Button>
                </div>
              </>
            )
          }
        >
          <label>Full name
            <input value={editingMember.name} onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })} />
          </label>
          <label>Assignment group
            <select value={editingMember.group_id} onChange={(e) => setEditingMember({ ...editingMember, group_id: e.target.value })}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label>Status
            <select value={editingMember.status} onChange={(e) => setEditingMember({ ...editingMember, status: e.target.value as MemberStatus })}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Default shift
            <div className="shift-time-inputs">
              <div className="shift-time-field"><span>Start</span><input type="time" value={editingMember.default_shift_start} onChange={(e) => setEditingMember({ ...editingMember, default_shift_start: e.target.value })} /></div>
              <span className="shift-time-sep">→</span>
              <div className="shift-time-field"><span>End</span><input type="time" value={editingMember.default_shift_end} onChange={(e) => setEditingMember({ ...editingMember, default_shift_end: e.target.value })} /></div>
            </div>
          </label>
          <div className="form-row-2">
            <label>Expected weekly hours
              <input type="number" min="0" step="1" value={editingMember.expected_weekly_hours} onChange={(e) => setEditingMember({ ...editingMember, expected_weekly_hours: Number(e.target.value) || 0 })} />
            </label>
            <label>Daily unpaid break (hours)
              <input type="number" min="0" step="0.25" value={editingMember.daily_unpaid_break} onChange={(e) => setEditingMember({ ...editingMember, daily_unpaid_break: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <label>Hourly rate ($)
            <input type="number" min="0" step="0.01" value={editingMember.hourly_rate} onChange={(e) => setEditingMember({ ...editingMember, hourly_rate: Number(e.target.value) || 0 })} />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={editingMember.premium_pay_enabled} onChange={(e) => setEditingMember({ ...editingMember, premium_pay_enabled: e.target.checked })} />
            <span>Premium pay enabled</span>
          </label>
          {editingMember.premium_pay_enabled && (
            <div className="premium-fields">
              <label>Premium rate ($)
                <input type="number" min="0" step="0.01" value={editingMember.premium_rate} onChange={(e) => setEditingMember({ ...editingMember, premium_rate: Number(e.target.value) || 0 })} />
              </label>
              <div className="form-row-2">
                <label>Premium start date
                  <input type="date" value={editingMember.premium_start_date || ""} onChange={(e) => setEditingMember({ ...editingMember, premium_start_date: e.target.value || null })} />
                </label>
                <label>Premium end date
                  <input type="date" value={editingMember.premium_end_date || ""} onChange={(e) => setEditingMember({ ...editingMember, premium_end_date: e.target.value || null })} />
                </label>
              </div>
            </div>
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
          title="New assignment group"
          subtitle="Groups organize staff by job duty with their own hours and overtime rules."
          onClose={() => setCreatingGroup(false)}
          footer={
            <>
              <div />
              <div className="modal-actions-right">
                <Button onClick={() => setCreatingGroup(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleCreateGroup}>Create group</Button>
              </div>
            </>
          }
        >
          <label>Group name
            <input placeholder="e.g. Emergency Department Transporter" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()} />
          </label>
          <label>Hours of operation
            <div className="shift-time-inputs">
              <div className="shift-time-field"><span>Start</span><input type="time" value={newGroupStart} onChange={(e) => setNewGroupStart(e.target.value)} /></div>
              <span className="shift-time-sep">to</span>
              <div className="shift-time-field"><span>End</span><input type="time" value={newGroupEnd} onChange={(e) => setNewGroupEnd(e.target.value)} /></div>
            </div>
          </label>
          <div className="form-row-2">
            <label>Overtime threshold (hours over)
              <input type="number" min="0" step="1" value={newGroupOvertimeThreshold} onChange={(e) => setNewGroupOvertimeThreshold(Number(e.target.value) || 40)} />
            </label>
            <label>Overtime rate multiplier
              <input type="number" min="1" step="0.1" value={newGroupOvertimeMultiplier} onChange={(e) => setNewGroupOvertimeMultiplier(Number(e.target.value) || 1.5)} />
            </label>
          </div>
          <label>Base hourly rate ($)
            <input type="number" min="0" step="0.01" value={newGroupBaseRate} onChange={(e) => setNewGroupBaseRate(Number(e.target.value) || 0)} />
          </label>
        </Modal>
      )}

      {editingGroup && (
        <Modal
          title="Edit assignment group"
          subtitle="Update hours, overtime rules, and base rate. See assigned members below."
          onClose={() => setEditingGroup(null)}
          footer={
            <>
              <button className="btn-remove-shift" onClick={() => { setConfirmDeleteGroup(editingGroup); }}>Delete group</button>
              <div className="modal-actions-right">
                <Button onClick={() => setEditingGroup(null)}>Cancel</Button>
                <Button variant="primary" onClick={handleUpdateGroup}>Save changes</Button>
              </div>
            </>
          }
        >
          <label>Group name
            <input value={editingGroup.name} onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })} />
          </label>
          <label>Hours of operation
            <div className="shift-time-inputs">
              <div className="shift-time-field"><span>Start</span><input type="time" value={editingGroup.hours_of_service_start} onChange={(e) => setEditingGroup({ ...editingGroup, hours_of_service_start: e.target.value })} /></div>
              <span className="shift-time-sep">to</span>
              <div className="shift-time-field"><span>End</span><input type="time" value={editingGroup.hours_of_service_end} onChange={(e) => setEditingGroup({ ...editingGroup, hours_of_service_end: e.target.value })} /></div>
            </div>
          </label>
          <div className="form-row-2">
            <label>Overtime at (hours over)
              <input type="number" min="0" step="1" value={editingGroup.overtime_threshold} onChange={(e) => setEditingGroup({ ...editingGroup, overtime_threshold: Number(e.target.value) || 40 })} />
            </label>
            <label>Overtime rate (hourly rate x)
              <input type="number" min="1" step="0.1" value={editingGroup.overtime_rate_multiplier} onChange={(e) => setEditingGroup({ ...editingGroup, overtime_rate_multiplier: Number(e.target.value) || 1.5 })} />
            </label>
          </div>
          <label>Base hourly rate ($)
            <input type="number" min="0" step="0.01" value={editingGroup.base_hourly_rate} onChange={(e) => setEditingGroup({ ...editingGroup, base_hourly_rate: Number(e.target.value) || 0 })} />
          </label>
          <div className="group-members-list">
            <strong>Assigned members ({members.filter((m) => m.group_id === editingGroup.id).length})</strong>
            <div className="group-members-inner">
              {members.filter((m) => m.group_id === editingGroup.id).map((m) => (
                <div key={m.id} className="group-member-row">
                  <span>{m.name}</span>
                  <span className="group-member-shift">{compactShift(m.default_shift_start, m.default_shift_end)}</span>
                  <span className={`team-status-badge ${(m.status || "productive").toLowerCase()}`}>{m.status}</span>
                  <button className="group-member-remove" onClick={async () => {
                    await data.updateMember(m.id, { group_id: groups.find((g) => g.id !== editingGroup.id)?.id || "" });
                    await loadAll();
                    setEditingGroup((prev) => prev ? { ...prev } : null);
                  }} title="Remove from group"><Icon name="x" size={12} /></button>
                </div>
              ))}
              {members.filter((m) => m.group_id === editingGroup.id).length === 0 && (
                <div className="team-empty">No members assigned to this group.</div>
              )}
            </div>
          </div>
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
    </div>
  );
}
