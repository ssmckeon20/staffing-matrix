import * as XLSX from "xlsx";
import type { VolumeDataPoint } from "./types";

export interface ParsedTimestampRow {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0-6, 0 = Sunday
  hour: number; // 0-23
}

export interface ImportStats {
  rowsImported: number;
  rowsSkipped: number;
  dateFrom: string | null;
  dateTo: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

const toDateISO = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));

function parseDateCell(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    // Excel serial date
    return new Date(EXCEL_EPOCH.getTime() + Math.floor(value) * 86400000);
  }
  const s = String(value).trim();
  if (!s) return null;
  // Common formats: M/D/YYYY, YYYY-MM-DD, D-MMM-YY
  const m = s.match(/^(\d{1,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,4})$/);
  if (m) {
    let [, a, b, c] = m;
    let year: number, month: number, day: number;
    if (a.length === 4) { year = +a; month = +b; day = +c; }
    else { year = +c < 100 ? 2000 + +c : +c; month = +a; day = +b; }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

function parseTimeCell(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.getHours();
  if (typeof value === "number" && value >= 0 && value < 1) {
    return Math.floor(value * 24); // Excel time fraction
  }
  const s = String(value).trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (m) {
    let h = parseInt(m[1]);
    if (m[2] && parseInt(m[2]) >= 60) return null;
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) return h;
  }
  // H:MM:SS or HH:MM with optional seconds
  const t = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (t) {
    const h = parseInt(t[1]);
    if (h >= 0 && h <= 23) return h;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.getHours();
  return null;
}

function extractTimestamp(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const ms = EXCEL_EPOCH.getTime() + value * 86400000;
    return new Date(ms);
  }
  const s = String(value).trim();
  if (!s) return null;
  // ISO datetime or common formats
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
  if (iso) {
    return new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5]);
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

function hourFromRow(row: Record<string, unknown>, headers: string[]): Date | null {
  // 1. Single datetime column
  const dtKeys = ["datetime", "date_time", "timestamp", "date/time", "date time"];
  for (const key of headers) {
    const lk = key.toLowerCase().trim();
    if (dtKeys.includes(lk) || lk.endsWith("datetime") || lk.endsWith("timestamp")) {
      const dt = extractTimestamp(row[key]);
      if (dt) return dt;
    }
  }
  // 2. Separate date + time columns
  const dateKey = headers.find((h) => ["date", "day", "event date", "date of service"].includes(h.toLowerCase().trim()));
  const timeKey = headers.find((h) => ["time", "hour", "event time"].includes(h.toLowerCase().trim()));
  if (dateKey) {
    const d = parseDateCell(row[dateKey]);
    if (!d) return null;
    if (timeKey) {
      const h = parseTimeCell(row[timeKey]);
      if (h != null) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h);
      // "hour" column may be 0-23 or 1-24
      const raw = row[timeKey];
      if (typeof raw === "number" && raw >= 0 && raw <= 24) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), raw % 24);
      }
      return null;
    }
    // Date-only rows carry no hour information — skip them
    return null;
  }
  // 3. Any column that parses as datetime
  for (const key of headers) {
    const dt = extractTimestamp(row[key]);
    if (dt) return dt;
  }
  return null;
}

function sheetToRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
  return json;
}

export function parseFile(rows: Record<string, unknown>[][]): { points: ParsedTimestampRow[]; stats: ImportStats } {
  const points: ParsedTimestampRow[] = [];
  let skipped = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const rowsOfSheet of rows) {
    if (!rowsOfSheet || rowsOfSheet.length === 0) continue;
    const headers = Object.keys(rowsOfSheet[0] || {});
    for (const row of rowsOfSheet) {
      const dt = hourFromRow(row, headers);
      if (!dt || isNaN(dt.getTime())) { skipped++; continue; }
      const dateISO = toDateISO(dt);
      points.push({
        date: dateISO,
        dayOfWeek: dt.getDay(),
        hour: dt.getHours(),
      });
      if (!minDate || dateISO < minDate) minDate = dateISO;
      if (!maxDate || dateISO > maxDate) maxDate = dateISO;
    }
  }

  return {
    points,
    stats: { rowsImported: points.length, rowsSkipped: skipped, dateFrom: minDate, dateTo: maxDate },
  };
}

export async function readFileToSheets(file: File): Promise<Record<string, unknown>[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    return wb.SheetNames.map((n) => sheetToRows(wb.Sheets[n]));
  }
  // CSV / TSV / TXT
  const text = await file.text();
  const delimiter = name.endsWith(".tsv") || text.includes("\t") ? "\t" : ",";
  const wb = XLSX.read(text, { type: "string", raw: false, FS: delimiter, cellDates: true });
  return wb.SheetNames.map((n) => sheetToRows(wb.Sheets[n]));
}

export interface VolumeRecommendation {
  hourlyVolume: number[]; // 24 weekday averages, rounded
  weekendMultiplier: number; // rounded to 2 decimals
  weekdayAvgPerHour: number[];
  weekendAvgPerHour: number[];
  weekdayDays: number;
  weekendDays: number;
}

export function computeVolumeRecommendation(
  points: VolumeDataPoint[],
  opsStartHour?: number,
  opsEndHour?: number
): VolumeRecommendation {
  const empty: VolumeRecommendation = {
    hourlyVolume: Array(24).fill(0),
    weekendMultiplier: 0.65,
    weekdayAvgPerHour: Array(24).fill(0),
    weekendAvgPerHour: Array(24).fill(0),
    weekdayDays: 0,
    weekendDays: 0,
  };
  if (points.length === 0) return empty;

  const inWindow = (hour: number) => {
    if (opsStartHour == null || opsEndHour == null) return true;
    return hour >= opsStartHour && hour <= opsEndHour;
  };

  const weekdaySums = Array(24).fill(0);
  const weekendSums = Array(24).fill(0);
  const weekdayDaySet = new Set<string>();
  const weekendDaySet = new Set<string>();

  for (const p of points) {
    if (!inWindow(p.hour)) continue;
    if (p.day_of_week === 0 || p.day_of_week === 6) {
      weekendSums[p.hour] += p.count;
      weekendDaySet.add(p.event_date);
    } else {
      weekdaySums[p.hour] += p.count;
      weekdayDaySet.add(p.event_date);
    }
  }

  const weekdayDays = weekdayDaySet.size;
  const weekendDays = weekendDaySet.size;

  const weekdayAvg = weekdaySums.map((s) => (weekdayDays > 0 ? s / weekdayDays : 0));
  const weekendAvg = weekendSums.map((s) => (weekendDays > 0 ? s / weekendDays : 0));

  const hourlyVolume = weekdayAvg.map((v) => Math.max(0, Math.round(v)));
  const totalWeekdayAvg = weekdayAvg.reduce((a, b) => a + b, 0) / 24;
  const totalWeekendAvg = weekendAvg.reduce((a, b) => a + b, 0) / 24;

  let mult = 0.65;
  if (totalWeekdayAvg > 0 && weekendDays > 0) {
    mult = Math.min(1.5, Math.max(0, totalWeekendAvg / totalWeekdayAvg));
  }

  return {
    hourlyVolume,
    weekendMultiplier: Math.round(mult * 100) / 100,
    weekdayAvgPerHour: weekdayAvg.map((v) => Math.round(v * 10) / 10),
    weekendAvgPerHour: weekendAvg.map((v) => Math.round(v * 10) / 10),
    weekdayDays,
    weekendDays,
  };
}
