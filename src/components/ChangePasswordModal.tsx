import { useState } from "react";
import { Button, Icon, Modal } from "./ui";
import { supabase } from "../lib/supabase";

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleChange() {
    setError("");
    if (!newPassword) {
      setError("Enter a new password.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword });
      if (err) throw err;
      setSuccess(true);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Change password"
      subtitle="Set a new password for your account. You'll use it the next time you sign in."
      onClose={onClose}
    >
      {success ? (
        <>
          <div className="success-banner">
            <Icon name="check" size={14} /> Your password has been updated.
          </div>
          <div className="modal-actions">
            <Button variant="primary" onClick={onClose}>Done</Button>
          </div>
        </>
      ) : (
        <>
          {error && <div className="error-banner"><Icon name="alert" size={14} /> {error}</div>}
          <div className="access-section">
            <div className="dept-field">
              <label>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleChange()}
              />
            </div>
            <div className="dept-field">
              <label>Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                onKeyDown={(e) => e.key === "Enter" && handleChange()}
              />
            </div>
            <div className="dept-actions">
              <Button variant="primary" icon="check" onClick={handleChange} disabled={busy}>
                {busy ? "Saving…" : "Update password"}
              </Button>
              <button className="dept-cancel-btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
