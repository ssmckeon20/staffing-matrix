import { useState, useCallback } from "react";
import { Icon, type IconName } from "./components/ui";
import TeamTab from "./components/TeamTab";
import MatrixTab from "./components/MatrixTab";
import EmployeeTab from "./components/EmployeeTab";
import HistoryTab from "./components/HistoryTab";

type View = "team" | "matrix" | "employee" | "history";

const NAV_ITEMS: { view: View; label: string; icon: IconName; title: string }[] = [
  { view: "team", label: "Team", icon: "team", title: "Team management" },
  { view: "matrix", label: "Staffing matrix", icon: "layout", title: "Staffing matrix" },
  { view: "employee", label: "Employee schedule", icon: "calendar", title: "Employee schedule" },
  { view: "history", label: "Change history", icon: "history", title: "Change history" },
];

function App() {
  const [view, setView] = useState<View>("team");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState("");

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Icon name="layout" size={20} /></div>
          <span>Shiftline</span>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={sidebarCollapsed ? "chevronRight" : "chevronLeft"} size={14} />
          </button>
        </div>
        <div className="facility">
          <span className="eyebrow">Department</span>
          <strong>Patient Transportation</strong>
          <small>Texas Health Dallas</small>
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
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" title="Settings">
            <Icon name="settings" />
            <span>Settings</span>
          </button>
          <div className="user-card">
            <div className="avatar">AD</div>
            <div>
              <strong>Admin</strong>
              <small>Schedule manager</small>
            </div>
            <Icon name="chevronDown" size={16} />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">Shiftline</div>
          <div className="top-actions">
            <span className="saved-status"><span />Auto-saved</span>
          </div>
        </header>

        {view === "team" && <TeamTab />}
        {view === "matrix" && <MatrixTab toast={notify} />}
        {view === "employee" && <EmployeeTab toast={notify} />}
        {view === "history" && <HistoryTab />}
      </main>

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
