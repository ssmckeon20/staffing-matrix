import { useState } from "react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { Icon } from "../components/ui";

type Mode = "sign-in" | "sign-up" | "setup";

interface ClaimableSite { id: string; name: string; cost_center_number: string }

export default function AuthScreen({ mode, hasInvite }: { mode: Mode; hasInvite: boolean }) {
  const { signIn, signUp, signOut, createSite, error, clearError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [tab, setTab] = useState<"sign-in" | "sign-up">("sign-in");
  const [siteName, setSiteName] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [claimable, setClaimable] = useState<ClaimableSite[] | null>(null);
  const [localError, setLocalError] = useState("");

  const errorText = localError || error;

  async function handleSubmit() {
    setLocalError("");
    if (!email.trim() || !password) {
      setLocalError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      if (tab === "sign-in") {
        await signIn(email.trim(), password);
      } else {
        if (!firstName.trim() || !lastName.trim()) {
          setLocalError("Enter your first and last name.");
          setBusy(false);
          return;
        }
        await signUp(email.trim(), password, firstName.trim(), lastName.trim());
      }
    } catch (e) {
      setLocalError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateDepartment() {
    setLocalError("");
    if (!siteName.trim()) {
      setLocalError("Give your department a name.");
      return;
    }
    setBusy(true);
    try {
      await createSite(siteName.trim(), costCenter.trim() || "0000");
    } catch (e) {
      setLocalError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  if (mode === "setup") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-mark"><Icon name="layout" size={20} /></div>
            <span>Shiftline</span>
          </div>
          <h1>Set up your workspace</h1>
          <p className="auth-sub">
            If you already had schedules in ShiftLine, claim that workspace below.
            Otherwise, create a new department. You can belong to multiple
            departments and switch between them.
          </p>
          {hasInvite && (
            <div className="auth-invite-note">
              <Icon name="alert" size={14} /> You have a pending invitation. Use the invite link again after setting up your workspace to accept it.
            </div>
          )}
          {errorText && <div className="error-banner"><Icon name="alert" size={14} /> {errorText}</div>}
          {claimable === null ? (
            <button
              className="button button-primary auth-submit"
              onClick={async () => {
                setLocalError("");
                setBusy(true);
                try {
                  const { data, error: err } = await supabase.rpc("list_claimable_sites");
                  if (err) setLocalError(err.message);
                  else setClaimable((data as Claimable[]) ?? []);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              {busy ? "Checking…" : "Check for my existing schedules"}
            </button>
          ) : claimable.length > 0 ? (
            <div className="auth-claim-list">
              {claimable.map((s) => (
                <div className="auth-claim-row" key={s.id}>
                  <div>
                    <strong>{s.name}</strong>
                    <span>Cost center {s.cost_center_number}</span>
                  </div>
                  <button
                    className="button button-primary"
                    onClick={async () => {
                      setLocalError("");
                      setBusy(true);
                      try {
                        const { error: err } = await supabase.rpc("claim_site", { p_site_id: s.id });
                        if (err) setLocalError(err.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy}
                  >
                    Claim
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="access-muted">No existing workspace found — create one below.</p>
          )}
          <div className="auth-divider"><span>or create a new department</span></div>
          <div className="auth-field">
            <label>Department name</label>
            <input
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Patient Transportation"
            />
          </div>
          <div className="auth-field">
            <label>Cost center number (optional)</label>
            <input
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              placeholder="e.g. 4210"
            />
          </div>
          <button className="button button-primary auth-submit" onClick={handleCreateDepartment} disabled={busy}>
            {busy ? "Creating…" : "Create department"}
          </button>
          <button className="button button-ghost auth-secondary" onClick={() => signOut()} disabled={busy}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><Icon name="layout" size={20} /></div>
          <span>Shiftline</span>
        </div>
        <h1>{tab === "sign-in" ? "Welcome back" : "Create your account"}</h1>
        <p className="auth-sub">
          {hasInvite
            ? "You've been invited to join a department. Sign in or create an account to accept."
            : "Sign in to manage your department's schedule and staffing."}
        </p>
        <div className="auth-tabs">
          <button className={tab === "sign-in" ? "active" : ""} onClick={() => { setTab("sign-in"); clearError(); setLocalError(""); }}>Sign in</button>
          <button className={tab === "sign-up" ? "active" : ""} onClick={() => { setTab("sign-up"); clearError(); setLocalError(""); }}>Sign up</button>
        </div>
        {errorText && <div className="error-banner"><Icon name="alert" size={14} /> {errorText}</div>}
        {tab === "sign-up" && (
          <div className="auth-row">
            <div className="auth-field">
              <label>First name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" />
            </div>
            <div className="auth-field">
              <label>Last name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Diaz" />
            </div>
          </div>
        )}
        <div className="auth-field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="you@hospital.org"
          />
        </div>
        <div className="auth-field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={tab === "sign-up" ? "At least 6 characters" : "Your password"}
          />
        </div>
        <button className="button button-primary auth-submit" onClick={handleSubmit} disabled={busy}>
          {busy ? "Please wait…" : tab === "sign-in" ? "Sign in" : "Create Account"}
        </button>
      </div>
    </div>
  );
}
