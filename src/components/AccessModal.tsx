import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth, type SiteRole } from "../lib/auth";
import { Button, Modal, ConfirmBanner } from "./ui";

interface MemberRow {
  user_id: string;
  role: SiteRole;
  name: string;
  employee_id: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
}

const ROLE_LABEL: Record<SiteRole, string> = {
  owner: "Owner",
  admin: "Admin",
  viewer: "Viewer",
};

export default function AccessModal({ onClose }: { onClose: () => void }) {
  const { activeSite, activeRole, refresh, error, clearError } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "viewer">("viewer");
  const [inviteLink, setInviteLink] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<MemberRow | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = activeRole === "owner";

  // Department details (name + cost center) editing state
  const [editingDept, setEditingDept] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [deptCostCenter, setDeptCostCenter] = useState("");
  const [deptLocked, setDeptLocked] = useState(false);
  const [deptError, setDeptError] = useState("");

  const loadDeptDetails = useCallback(async () => {
    if (!activeSite) return;
    const { data } = await supabase
      .from("sites")
      .select("name, cost_center_number, details_locked")
      .eq("id", activeSite.id)
      .maybeSingle();
    if (data) {
      setDeptName(data.name);
      setDeptCostCenter(data.cost_center_number);
      setDeptLocked(!!data.details_locked);
    }
  }, [activeSite]);

  useEffect(() => { loadDeptDetails(); }, [loadDeptDetails]);

  async function saveDeptDetails() {
    if (!activeSite) return;
    setDeptError("");
    if (!deptName.trim()) {
      setDeptError("Department name is required.");
      return;
    }
    setBusy(true);
    const { error: err } = await supabase
      .from("sites")
      .update({
        name: deptName.trim(),
        cost_center_number: deptCostCenter.trim() || "0000",
        details_locked: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", activeSite.id);
    if (err) {
      setDeptError(err.message);
    } else {
      setDeptLocked(true);
      setEditingDept(false);
      await refresh();
    }
    setBusy(false);
  }
  const load = useCallback(async () => {
    if (!activeSite) return;
    setLoading(true);
    const [{ data: memData, error: memErr }, { data: invData, error: invErr }] = await Promise.all([
      supabase
        .from("site_members")
        .select("user_id, role, profile:profiles(first_name, last_name, employee_id)")
        .eq("site_id", activeSite.id),
      supabase
        .from("site_invitations")
        .select("id, email, role, status, expires_at")
        .eq("site_id", activeSite.id)
        .order("created_at", { ascending: false }),
    ]);
    if (memErr) setPageError(String(memErr.message));
    else {
      setMembers(
        (memData ?? []).map((m) => {
          const prof = m.profile as { first_name: string; last_name: string; employee_id: string | null } | null;
          return {
            user_id: m.user_id,
            role: m.role as SiteRole,
            name: prof ? [prof.first_name, prof.last_name].filter(Boolean).join(" ") || "Member" : "Member",
            employee_id: prof?.employee_id ?? null,
          };
        })
      );
    }
    if (invErr) setPageError(String(invErr.message));
    else setInvites(invData ?? []);
    setLoading(false);
  }, [activeSite]);

  useEffect(() => { load(); }, [load]);

  async function sendInvite() {
    setPageError("");
    if (!activeSite) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setPageError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error: err } = await supabase.from("site_invitations").insert({
      site_id: activeSite.id,
      email,
      role: inviteRole,
      token,
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    if (err) setPageError(err.message);
    else {
      setInviteLink(`${window.location.origin}${window.location.pathname}?invite=${token}`);
      setInviteEmail("");
      await load();
    }
    setBusy(false);
  }

  async function revokeInvite(inv: InviteRow) {
    setPageError("");
    const { error: err } = await supabase.from("site_invitations").update({ status: "revoked" }).eq("id", inv.id);
    if (err) setPageError(err.message);
    else await load();
  }

  async function changeRole(member: MemberRow, role: SiteRole) {
    setPageError("");
    const { error: err } = await supabase
      .from("site_members")
      .update({ role })
      .eq("site_id", activeSite!.id)
      .eq("user_id", member.user_id);
    if (err) setPageError(err.message);
    else await load();
  }

  async function removeMember(member: MemberRow) {
    setPageError("");
    const { error: err } = await supabase
      .from("site_members")
      .delete()
      .eq("site_id", activeSite!.id)
      .eq("user_id", member.user_id);
    if (err) setPageError(err.message);
    else {
      setConfirmRemove(null);
      await load();
    }
  }

  const pendingInvites = invites.filter((i) => i.status === "pending");

  return (
    <Modal
      title="People & access"
      subtitle={activeSite ? `Manage who can access "${activeSite.name}"` : undefined}
      onClose={onClose}
    >
      {pageError && <div className="error-banner"><Icon name="alert" size={14} /> {pageError}</div>}
      {(error || !activeSite) && <div className="error-banner"><Icon name="alert" size={14} /> No department selected.</div>}

      {activeSite && (
        <>
          <div className="access-section">
            <div className="dept-details-head">
              <h4>Department details</h4>
              {isOwner && !deptLocked && !editingDept && (
                <button className="dept-edit-btn" onClick={() => setEditingDept(true)}>Edit</button>
              )}
            </div>
            {editingDept ? (
              <>
                <div className="dept-details-edit">
                  <div className="dept-field">
                    <label>Department name</label>
                    <input
                      value={deptName}
                      onChange={(e) => setDeptName(e.target.value)}
                      placeholder="e.g. Patient Transportation"
                      autoFocus
                    />
                  </div>
                  <div className="dept-field">
                    <label>Cost center number</label>
                    <input
                      value={deptCostCenter}
                      onChange={(e) => setDeptCostCenter(e.target.value)}
                      placeholder="e.g. 4210"
                    />
                  </div>
                </div>
                {deptError && <p className="dept-error">{deptError}</p>}
                <div className="dept-actions">
                  <Button icon="save" onClick={saveDeptDetails} disabled={busy}>
                    {busy ? "Saving…" : "Save & lock"}
                  </Button>
                  <button className="dept-cancel-btn" onClick={() => { setEditingDept(false); setDeptError(""); }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="dept-details-view">
                <div>
                  <span>Department</span>
                  <strong>{deptName || activeSite.name}</strong>
                </div>
                <div>
                  <span>Cost center</span>
                  <strong>{deptCostCenter || activeSite.cost_center_number}</strong>
                </div>
                {deptLocked && <span className="dept-locked-note">Locked — only you set these once.</span>}
              </div>
            )}
          </div>

          {isOwner && (
            <div className="access-invite-box">
              <strong>Invite a teammate</strong>
              <div className="access-invite-row">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendInvite()}
                  placeholder="teammate@hospital.org"
                />
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "viewer")}>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
                <button className="button button-primary" onClick={sendInvite} disabled={busy}>
                  Send invite
                </button>
              </div>
              {inviteLink && (
                <div className="access-link-box">
                  <span>Share this invite link (works once, expires in 7 days):</span>
                  <div className="access-link-row">
                    <input readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
                    <Button
                      icon="check"
                      onClick={() => { navigator.clipboard?.writeText(inviteLink); }}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="access-section">
            <h4>Members</h4>
            {loading ? (
              <p className="access-muted">Loading…</p>
            ) : members.length === 0 ? (
              <p className="access-muted">No members yet.</p>
            ) : (
              <div className="access-list">
                {members.map((m) => (
                  <div className="access-row" key={m.user_id}>
                    <div className="access-name">
                      <strong>{m.name}</strong>
                      <span>{m.employee_id ? `ID ${m.employee_id}` : "—"}{m.role === "owner" ? " · owns this department" : ""}</span>
                    </div>
                    {isOwner && m.role !== "owner" ? (
                      <div className="access-actions">
                        <select
                          value={m.role}
                          onChange={(e) => changeRole(m, e.target.value as SiteRole)}
                        >
                          <option value="admin">Admin</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button className="access-remove" onClick={() => setConfirmRemove(m)}>Remove</button>
                      </div>
                    ) : (
                      <span className="access-role-badge">{ROLE_LABEL[m.role]}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isOwner && pendingInvites.length > 0 && (
            <div className="access-section">
              <h4>Pending invitations</h4>
              <div className="access-list">
                {pendingInvites.map((inv) => (
                  <div className="access-row" key={inv.id}>
                    <div className="access-name">
                      <strong>{inv.email}</strong>
                      <span>{inv.role === "admin" ? "Admin" : "Viewer"} · expires {new Date(inv.expires_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
                    </div>
                    <div className="access-actions">
                      <button className="access-remove" onClick={() => revokeInvite(inv)}>Revoke</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {confirmRemove && (
            <ConfirmBanner
              message={`Remove ${confirmRemove.name} from "${activeSite.name}"? They will lose access immediately.`}
              onCancel={() => setConfirmRemove(null)}
              onConfirm={() => removeMember(confirmRemove)}
              confirmLabel="Remove"
            />
          )}
        </>
      )}
    </Modal>
  );
}
