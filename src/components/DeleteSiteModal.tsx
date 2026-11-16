import { useState } from "react";
import { Button, Icon, Modal } from "./ui";
import { useAuth, type Membership } from "../lib/auth";

type Step = "choose" | "warn" | "initials";

export default function DeleteSiteModal({ onClose }: { onClose: () => void }) {
  const { memberships, activeSite, deleteSite, profile } = useAuth();
  const [step, setStep] = useState<Step>("choose");
  const [selected, setSelected] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ownMemberships = memberships.filter((m) => m.role === "owner");
  const target = ownMemberships.find((m) => m.site.id === selected) ?? null;

  const expectedInitials = profile
    ? ((profile.first_name[0] || "") + (profile.last_name[0] || "")).toUpperCase()
    : "";

  function openWarn(siteId: string) {
    setSelected(siteId);
    setStep("warn");
  }

  async function handleDelete() {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await deleteSite(target.site.id);
      onClose();
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setBusy(false);
    }
  }

  if (ownMemberships.length === 0) {
    return (
      <Modal
        title="Delete cost center"
        subtitle="There are no cost centers where you are the owner."
        onClose={onClose}
      >
        <div className="dept-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Delete cost center"
      subtitle={
        step === "choose"
          ? "Select the cost center you want to delete. You must be its owner."
          : step === "warn"
            ? "Read this carefully before continuing."
            : "Final confirmation required."
      }
      onClose={onClose}
    >
      {step === "choose" && (
        <div className="access-section">
          <div className="delete-site-list">
            {ownMemberships.map((m) => (
              <button
                key={m.site.id}
                className={
                  "delete-site-option" +
                  (selected === m.site.id ? " selected" : "") +
                  (m.site.id === activeSite?.id ? " current" : "")
                }
                onClick={() => openWarn(m.site.id)}
              >
                <Icon name="layout" size={16} />
                <span className="delete-site-name">{m.site.name}</span>
                <small>Cost center {m.site.cost_center_number}</small>
                {m.site.id === activeSite?.id && <em>Current</em>}
              </button>
            ))}
          </div>
          <div className="dept-actions">
            <button className="dept-cancel-btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}

      {step === "warn" && target && (
        <div className="access-section">
          <div className="delete-warn-box">
            <Icon name="alert" size={20} />
            <div>
              <strong>Permanently delete “{target.site.name}”?</strong>
              <p>
                This will permanently remove the cost center and everything in it — all team
                members, schedules, assignments, volume data, budgets, and history. This action
                cannot be undone.
              </p>
            </div>
          </div>
          <div className="dept-actions">
            <button className="dept-cancel-btn" onClick={() => setStep("choose")} disabled={busy}>
              Back
            </button>
            <Button icon="trash" variant="primary" onClick={() => setStep("initials")} disabled={busy}>
              I understand, continue
            </Button>
          </div>
          {error && <div className="error-banner"><Icon name="alert" size={14} /> {error}</div>}
        </div>
      )}

      {step === "initials" && target && (
        <div className="access-section">
          <div className="delete-warn-box">
            <Icon name="alert" size={20} />
            <div>
              <strong>Final step — type your initials ({expectedInitials}) to delete “{target.site.name}”.</strong>
              <p>
                You are about to permanently delete this cost center and all of its data. This
                cannot be undone.
              </p>
            </div>
          </div>
          <div className="dept-field">
            <label>Your initials</label>
            <input
              value={userInitials}
              onChange={(e) => setUserInitials(e.target.value)}
              placeholder={expectedInitials}
              autoFocus
              maxLength={4}
              onKeyDown={(e) => e.key === "Enter" && !busy && handleDelete()}
            />
          </div>
          <div className="dept-actions">
            <button className="dept-cancel-btn" onClick={() => setStep("warn")} disabled={busy}>
              Back
            </button>
            <Button icon="trash" variant="primary" onClick={handleDelete} disabled={busy || userInitials.trim().toUpperCase() !== expectedInitials}>
              {busy ? "Deleting…" : "Delete cost center forever"}
            </Button>
          </div>
          {error && <div className="error-banner"><Icon name="alert" size={14} /> {error}</div>}
        </div>
      )}
    </Modal>
  );
}
