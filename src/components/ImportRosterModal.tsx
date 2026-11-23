import { useState, useRef } from "react";
import type { AssignmentGroup, TeamMember } from "../lib/types";
import { Button, Icon, Modal } from "./ui";
import { readRosterFile, parseRosterRows, type ParsedRosterRow } from "../lib/rosterImport";
import { createMember } from "../lib/data";

interface ImportRosterModalProps {
  groups: AssignmentGroup[];
  existingMembers: TeamMember[];
  onClose: () => void;
  onImported: () => void;
}

type Phase = "upload" | "preview" | "importing" | "done";

export default function ImportRosterModal({ groups, existingMembers, onClose, onImported }: ImportRosterModalProps) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [parsedRows, setParsedRows] = useState<ParsedRosterRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState("");
  const [targetGroup, setTargetGroup] = useState(groups[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, skippedDup: 0 });
  const [importSummary, setImportSummary] = useState({ created: 0, skippedDup: 0, skippedNoName: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const existingIds = new Set(
    existingMembers.map((m) => m.employee_id).filter((id): id is string => !!id)
  );

  async function handleFile(file: File) {
    setError("");
    setFileName(file.name);
    try {
      const sheets = await readRosterFile(file);
      const result = parseRosterRows(sheets);
      if (!result.detectedColumns.name) {
        setError("Could not find a name column. Make sure your spreadsheet has a column labeled \"Name\", \"Employee Name\", or similar.");
        return;
      }
      setParsedRows(result.rows);
      setSkipped(result.skipped);
      if (result.rows.length === 0) {
        setError("No valid rows found. The spreadsheet needs at least one row with a name.");
        return;
      }
      setPhase("preview");
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    if (!targetGroup) {
      setError("Select an assignment group for the imported members.");
      return;
    }
    setPhase("importing");
    let created = 0;
    let skippedDup = 0;

    for (const row of parsedRows) {
      setImportProgress({ done: created + skippedDup, total: parsedRows.length, skippedDup });
      if (row.employee_id && existingIds.has(row.employee_id)) {
        skippedDup++;
        continue;
      }
      try {
        await createMember({
          group_id: targetGroup,
          name: row.name,
          employee_id: row.employee_id,
          status: "Productive",
          expected_weekly_hours: 40,
          daily_unpaid_break: 0.5,
          overtime_threshold: 40,
          hourly_rate: row.hourly_rate,
          notes: null,
        });
        created++;
        if (row.employee_id) existingIds.add(row.employee_id);
      } catch {
        skippedDup++;
      }
    }

    setImportProgress({ done: parsedRows.length, total: parsedRows.length, skippedDup });
    setImportSummary({ created, skippedDup, skippedNoName: skipped });
    setPhase("done");
    onImported();
  }

  const previewRows = parsedRows.slice(0, 50);
  const remainingCount = parsedRows.length - previewRows.length;

  return (
    <Modal
      title="Import roster"
      subtitle="Upload a spreadsheet with employee names, ID numbers, and hourly rates. Imported members are added to the assignment group you choose — you can edit or remove them afterward."
      onClose={onClose}
      footer={
        phase === "preview" ? (
          <>
            <div />
            <div className="modal-actions-right">
              <Button onClick={() => { setPhase("upload"); setParsedRows([]); setError(""); setFileName(""); }}>Back</Button>
              <Button variant="primary" icon="check" onClick={handleImport} disabled={!targetGroup}>
                Import {parsedRows.length} member{parsedRows.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </>
        ) : phase === "done" ? (
          <>
            <div />
            <div className="modal-actions-right">
              <Button variant="primary" onClick={onClose}>Done</Button>
            </div>
          </>
        ) : undefined
      }
    >
      {error && <div className="error-banner"><Icon name="alert" size={14} /> {error}</div>}

      {phase === "upload" && (
        <div
          className={`roster-drop-zone ${dragOver ? "drag-over" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Icon name="upload" size={28} />
          <strong>Drop your spreadsheet here or click to browse</strong>
          <span>Supports .xlsx, .xls, and .csv files</span>
          <span className="roster-hint">Your file should have columns for name, employee ID, and hourly rate</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.tsv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {phase === "preview" && (
        <div className="roster-preview">
          <div className="roster-file-info">
            <Icon name="check" size={16} />
            <span>{fileName}</span>
            <span className="roster-row-count">{parsedRows.length} employees detected</span>
            {skipped > 0 && <span className="roster-skipped">{skipped} row{skipped !== 1 ? "s" : ""} skipped (no name)</span>}
          </div>
          <div className="dept-field">
            <label>Add all imported members to</label>
            <select value={targetGroup} onChange={(e) => setTargetGroup(e.target.value)}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="roster-table-wrap">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee ID</th>
                  <th>Hourly Rate</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.name}</td>
                    <td>{row.employee_id || "—"}</td>
                    <td>{row.hourly_rate > 0 ? `$${row.hourly_rate.toFixed(2)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {remainingCount > 0 && (
              <p className="roster-more">…and {remainingCount} more</p>
            )}
          </div>
        </div>
      )}

      {phase === "importing" && (
        <div className="roster-progress">
          <div className="roster-progress-bar">
            <div
              className="roster-progress-fill"
              style={{ width: `${importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}%` }}
            />
          </div>
          <p>Importing {importProgress.done} of {importProgress.total} members…</p>
        </div>
      )}

      {phase === "done" && (
        <div className="success-banner roster-summary">
          <Icon name="check" size={16} />
          <div>
            <strong>{importSummary.created} member{importSummary.created !== 1 ? "s" : ""} imported successfully.</strong>
            {importSummary.skippedDup > 0 && <p>{importSummary.skippedDup} skipped (duplicate employee ID or error).</p>}
            {importSummary.skippedNoName > 0 && <p>{importSummary.skippedNoName} skipped (missing name in spreadsheet).</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
