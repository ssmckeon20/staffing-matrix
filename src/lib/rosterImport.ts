import * as XLSX from "xlsx";

export interface ParsedRosterRow {
  name: string;
  employee_id: string | null;
  hourly_rate: number;
}

export interface RosterParseResult {
  rows: ParsedRosterRow[];
  skipped: number;
  detectedColumns: { name: string | null; employeeId: string | null; hourlyRate: string | null };
}

const NAME_KEYS = [
  "name", "employee name", "full name", "staff name", "person", "worker",
  "first name", "lastname", "last name",
];
const ID_KEYS = [
  "employee id", "emp id", "eid", "id", "id number", "id#", "employeeid",
  "employee number", "staff id", "personnel id",
];
const RATE_KEYS = [
  "hourly rate", "rate", "pay rate", "hourly pay", "wage", "hourly wage",
  "base rate", "base hourly rate", "rate/hr", "pay",
];

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[_\-\s]+/g, " ");
}

function findColumn(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map(normalizeHeader);
  for (const cand of candidates) {
    const idx = normalized.indexOf(cand);
    if (idx >= 0) return headers[idx];
  }
  for (const cand of candidates) {
    const idx = normalized.findIndex((n) => n.includes(cand));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function sheetToRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
}

function parseRate(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  const s = String(value).replace(/[^0-9.]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function parseRosterRows(sheetData: Record<string, unknown>[][]): RosterParseResult {
  const allRows: Record<string, unknown>[] = [];
  for (const sheet of sheetData) {
    if (sheet && sheet.length > 0) allRows.push(...sheet);
  }

  if (allRows.length === 0) {
    return { rows: [], skipped: 0, detectedColumns: { name: null, employeeId: null, hourlyRate: null } };
  }

  const headers = Object.keys(allRows[0] || {});
  const nameCol = findColumn(headers, NAME_KEYS);
  const idCol = findColumn(headers, ID_KEYS);
  const rateCol = findColumn(headers, RATE_KEYS);

  if (!nameCol) {
    return { rows: [], skipped: allRows.length, detectedColumns: { name: null, employeeId: idCol, hourlyRate: rateCol } };
  }

  const rows: ParsedRosterRow[] = [];
  let skipped = 0;

  for (const raw of allRows) {
    const nameVal = raw[nameCol];
    const name = nameVal != null ? String(nameVal).trim() : "";
    if (!name) {
      skipped++;
      continue;
    }
    rows.push({
      name,
      employee_id: idCol && raw[idCol] != null ? String(raw[idCol]).trim() || null : null,
      hourly_rate: rateCol ? parseRate(raw[rateCol]) : 0,
    });
  }

  return {
    rows,
    skipped,
    detectedColumns: { name: nameCol, employeeId: idCol, hourlyRate: rateCol },
  };
}

export async function readRosterFile(file: File): Promise<Record<string, unknown>[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    return wb.SheetNames.map((n) => sheetToRows(wb.Sheets[n]));
  }
  const text = await file.text();
  const delimiter = name.endsWith(".tsv") || text.includes("\t") ? "\t" : ",";
  const wb = XLSX.read(text, { type: "string", raw: false, FS: delimiter, cellDates: true });
  return wb.SheetNames.map((n) => sheetToRows(wb.Sheets[n]));
}
