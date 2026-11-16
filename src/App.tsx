import { useState, useCallback, useEffect } from "react";
import { Icon, type IconName } from "./components/ui";
import TeamTab from "./components/TeamTab";
import MatrixTab from "./components/MatrixTab";
import EmployeeTab from "./components/EmployeeTab";
import HistoryTab from "./components/HistoryTab";
import AgentTab from "./components/AgentTab";
import AccessModal from "./components/AccessModal";
import DeleteSiteModal from "./components/DeleteSiteModal";
import { Button, Modal } from "./components/ui";
import AuthScreen from "./screens/AuthScreen";
import { useAuth } from "./lib/auth";
import { supabase } from "./lib/supabase";
import type { ViewType } from "./lib/types";
import { getCurrentBiweeklyStart, formatDateISO } from "./lib/helpers";

type View = "team" | "matrix" | "employee" | "history" | "agent";

const NAV_ITEMS: { view: View; label: string; icon: IconName; title: string }[] = [
  { view: "team", label: "Team", icon: "team", title: "Team management" },
  { view: "matrix", label: "Staffing matrix", icon: "layout", title: "Staffing matrix" },
  { view: "employee", label: "Employee schedule", icon: "calendar", title: "Employee schedule" },
  { view: "history", label: "Change history", icon: "history", title: "Change history" },
];

function App() {
  const { ready, session, profile, memberships, activeSite, activeRole, canEdit, signOut, setActiveSiteId, refresh } = useAuth();
  const [view, setView] = useState<View>("team");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState("");
  const [showAccess, setShowAccess] = useState(false);
  const [showDeleteSite, setShowDeleteSite] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const [showCreateSite, setShowCreateSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteCostCenter, setNewSiteCostCenter] = useState("");
  const [createSiteBusy, setCreateSiteBusy] = useState(false);
  const [createSiteError, setCreateSiteError] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [acceptedSiteName, setAcceptedSiteName] = useState("");

  // Shared date range state across Matrix and Employee tabs
  const [viewType, setViewType] = useState<ViewType>("bi-weekly");
  const [rangeStart, setRangeStart] = useState<Date>(getCurrentBiweeklyStart());
  const [payPeriodStart, setPayPeriodStart] = useState<string>(() => {
    const stored = typeof localStorage !== "undefined" && localStorage.getItem("payPeriodStart");
    return stored || formatDateISO(getCurrentBiweeklyStart());
  });

  // Capture invite links (?invite=<token>)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (token) {
      setInviteToken(token);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Accept a pending invitation once the user is signed in
  useEffect(() => {
    if (!inviteToken || !session) return;
    (async () => {
      const { data, error: err } = await supabase.rpc("accept_site_invitation", { p_token: inviteToken });
      if (err) {
        setInviteError(err.message);
      } else if (typeof data === "string") {
        setAcceptedSiteName(data);
        await refresh();
      }
      setInviteToken(null);
    })();
  }, [inviteToken, session, refresh]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const { createSite } = useAuth();

  async function handleCreateSite() {
    setCreateSiteError("");
    if (!newSiteName.trim()) {
      setCreateSiteError("Give the cost center a name.");
      return;
    }
    setCreateSiteBusy(true);
    try {
      await createSite(newSiteName.trim(), newSiteCostCenter.trim() || "0000");
      setShowCreateSite(false);
      setNewSiteName("");
      setNewSiteCostCenter("");
      notify("New cost center created");
    } catch (e) {
      setCreateSiteError(String((e as Error).message ?? e));
    } finally {
      setCreateSiteBusy(false);
    }
  }

  // Signed-out (or still loading): show the auth screens
  if (!ready || !session || !activeSite) {
    if (!ready || !session) {
      return <AuthScreen mode="sign-in" hasInvite={!!inviteToken} />;
    }
    // Signed in but no department membership yet: workspace setup
    return <AuthScreen mode="setup" hasInvite={!!inviteToken} />;
  }

  const initials = profile
    ? ((profile.first_name[0] || "") + (profile.last_name[0] || "")).toUpperCase() || "ME"
    : "ME";
  const fullName = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") : "Member";

  return (
    <div className={`app-shell ${canEdit ? "" : "read-only"} ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Icon name="layout" size={20} /></div>
          <span>Shiftline</span>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={sidebarCollapsed ? "chevronLeft" : "chevronRight"} size={14} />
          </button>
        </div>
        <div className="facility site-switcher-wrap">
          <button
            className="site-switcher-btn"
            onClick={() => setSiteMenuOpen((o) => !o)}
            aria-expanded={siteMenuOpen}
            title="Switch cost center"
          >
            <span className="eyebrow">Department</span>
            <strong>{activeSite.name}</strong>
            <small>Cost center {activeSite.cost_center_number}</small>
            <Icon name="chevronDown" size={14} />
          </button>
          {siteMenuOpen && (
            <div className="site-menu" onClick={() => setSiteMenuOpen(false)}>
              <div className="user-menu-label">Your cost centers</div>
              {memberships.map((m) => (
                <button key={m.site.id} onClick={() => setActiveSiteId(m.site.id)}>
                  <Icon name="layout" size={14} /> {m.site.name}
                  {m.site.id === activeSite.id ? " ✓" : ""}
                </button>
              ))}
              {canEdit && (
                <button
                  className="site-menu-create"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSiteMenuOpen(false);
                    setCreateSiteError("");
                    setShowCreateSite(true);
                  }}
                >
                  <Icon name="plus" size={14} /> New cost center
                </button>
              )}
            </div>
          )}
        </div>
        <nav className="nav-list" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.view}
              className={view === item.view ? "nav-item active" : "nav-item"}
              onClick={() => setView(item.view)}
              title={item.title}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
          <button
            className={view === "agent" ? "nav-item nav-item-agent active" : "nav-item nav-item-agent"}
            onClick={() => setView("agent")}
            title="AI scheduling assistant"
          >
            <Icon name="sparkles" />
            <span>AI Assistant</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div
            className="user-card"
            onClick={() => setUserMenuOpen((o) => !o)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setUserMenuOpen((o) => !o); }}
          >
            <div className="avatar">{initials}</div>
            <div>
              <strong>{fullName || "Member"}</strong>
              <small>{activeRole === "owner" ? "Owner" : canEdit ? "Admin" : "View only"}</small>
            </div>
            <Icon name="chevronDown" size={16} />
          </div>
          {userMenuOpen && (
            <div className="user-menu" onClick={() => setUserMenuOpen(false)}>
              <button onClick={() => setShowAccess(true)} disabled={!canEdit}>
                <Icon name="team" size={14} /> People &amp; access
              </button>
              {activeRole === "owner" && memberships.length > 0 && (
                <button
                  className="user-menu-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserMenuOpen(false);
                    setShowDeleteSite(true);
                  }}
                >
                  <Icon name="trash" size={14} /> Delete a cost center…
                </button>
              )}
              {memberships.length > 1 && (
                <>
                  <div className="user-menu-label">Switch department</div>
                  {memberships.map((m) => (
                    <button key={m.site.id} onClick={() => setActiveSiteId(m.site.id)}>
                      <Icon name="layout" size={14} /> {m.site.name}
                      {m.site.id === activeSite.id ? " ✓" : ""}
                    </button>
                  ))}
                </>
              )}
              <button onClick={() => signOut()}>
                <Icon name="undo" size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">Shiftline</div>
          <div className="top-actions">
            {!canEdit && <span className="status-pill">View only</span>}
            <span className="saved-status"><span />Auto-saved</span>
          </div>
        </header>

        {view === "team" && <TeamTab />}
        {view === "matrix" && (
          <MatrixTab
            toast={notify}
            viewType={viewType}
            setViewType={setViewType}
            rangeStart={rangeStart}
            setRangeStart={setRangeStart}
            payPeriodStart={payPeriodStart}
            setPayPeriodStart={setPayPeriodStart}
          />
        )}
        {view === "employee" && (
          <EmployeeTab
            toast={notify}
            viewType={viewType}
            setViewType={setViewType}
            rangeStart={rangeStart}
            setRangeStart={setRangeStart}
            payPeriodStart={payPeriodStart}
            setPayPeriodStart={setPayPeriodStart}
          />
        )}
        {view === "history" && <HistoryTab />}
        {view === "agent" && <AgentTab />}
      </main>

      {showAccess && <AccessModal onClose={() => setShowAccess(false)} />}

      {showDeleteSite && <DeleteSiteModal onClose={() => setShowDeleteSite(false)} />}

      {showCreateSite && (
        <Modal
          title="New cost center"
          subtitle="Create an additional department workspace. You can switch between them anytime."
          onClose={() => setShowCreateSite(false)}
        >
          {createSiteError && <div className="error-banner"><Icon name="alert" size={14} /> {createSiteError}</div>}
          <div className="access-section">
            <div className="dept-field">
              <label>Department name</label>
              <input
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                placeholder="e.g. Patient Transportation"
                autoFocus
              />
            </div>
            <div className="dept-field">
              <label>Cost center number (optional)</label>
              <input
                value={newSiteCostCenter}
                onChange={(e) => setNewSiteCostCenter(e.target.value)}
                placeholder="e.g. 4210"
                onKeyDown={(e) => e.key === "Enter" && handleCreateSite()}
              />
            </div>
            <div className="dept-actions">
              <Button icon="check" onClick={handleCreateSite} disabled={createSiteBusy}>
                {createSiteBusy ? "Creating…" : "Create cost center"}
              </Button>
              <button
                className="dept-cancel-btn"
                onClick={() => setShowCreateSite(false)}
                disabled={createSiteBusy}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {toast && (
        <div className="toast">
          <span>&#10003;</span>
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
