import type { ShiftStatus } from "./types";

export const OFF = "Off";

export const to24 = (token: string) => {
  const m = token.trim().match(/(\d+):(\d+) (AM|PM)/);
  if (!m) return token;
  let h = Number(m[1]);
  if (m[3] === "PM" && h !== 12) h += 12;
  if (m[3] === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

export const inputToShiftTime = (val: string) => {
  if (!val) return "";
  const [hStr, mStr] = val.split(":");
  const h = Number(hStr);
  const m = Number(mStr || 0);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
};

export const timeToInput = (token: string) => {
  if (!token) return "";
  if (token.match(/^\d{2}:\d{2}$/)) return token;
  const match = token.match(/(\d+):(\d+) (AM|PM)/);
  if (!match) return "";
  const h = Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0);
  const m = Number(match[2]);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const timeValue = (value: string) => {
  if (!value) return 0;
  const match = value.match(/(\d+):(\d+) (AM|PM)/);
  if (!match) {
    const parts = value.split(":");
    if (parts.length === 2) return Number(parts[0]) + Number(parts[1]) / 60;
    return 0;
  }
  const h = Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0);
  return h + Number(match[2]) / 60;
};

export const inputTimeValue = (val: string) => {
  if (!val) return 0;
  const [h, m] = val.split(":").map(Number);
  return h + (m || 0) / 60;
};

export const shiftDuration = (start: string, end: string) => {
  if (!start || !end) return 0;
  const s = inputTimeValue(start);
  let e = inputTimeValue(end);
  if (e <= s) e += 24;
  const raw = e - s;
  return Math.round(raw * 10) / 10;
};

export const isActiveAt = (start: string | null, end: string | null, hour: number) => {
  if (!start || !end) return false;
  const s = inputTimeValue(start);
  let e = inputTimeValue(end);
  if (e <= s) e += 24;
  return hour >= s && hour < e;
};

export const formatShiftDisplay = (start: string | null, end: string | null, status: ShiftStatus) => {
  if (status === "Off" || (!start && !end)) return "-";
  if (status === "PTO") return "PTO";
  if (status === "LOA") return "LOA";
  if (status === "Vacation") return "Vac";
  if (!start || !end) return "-";
  return `${start}-${end}`;
};

export const compactShift = (start: string | null, end: string | null) => {
  if (!start || !end) return "";
  return `${start}-${end}`;
};

export const hoursLabel = (h: number) => {
  if (h === 0) return "0 hrs";
  return `${h.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} hrs`;
};

export const formatDate = (date: Date) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getMonth()]} ${date.getDate()}`;
};

export const formatDateISO = (date: Date) => {
  return date.toISOString().split("T")[0];
};

export const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const isWeekend = (date: Date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

export const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const getCurrentBiweeklyStart = () => {
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  // Find the most recent Sunday that starts a bi-weekly period
  // We use a reference date of Jan 4, 2026 (first Sunday of 2026) for cycle calculation
  const refDate = new Date(2026, 0, 4);
  const diffDays = Math.floor((sunday.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
  const weeksIntoCycle = Math.floor(diffDays / 7) % 2;
  const biweeklyStart = addDays(sunday, -(weeksIntoCycle * 7));
  return biweeklyStart;
};

export const getDateRange = (viewType: "daily" | "weekly" | "bi-weekly" | "monthly", startDate: Date) => {
  switch (viewType) {
    case "daily":
      return [startDate];
    case "weekly":
      return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
    case "bi-weekly":
      return Array.from({ length: 14 }, (_, i) => addDays(startDate, i));
    case "monthly":
      return Array.from({ length: 30 }, (_, i) => addDays(startDate, i));
  }
};

export const formatDateRange = (startDate: Date, endDate: Date) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[startDate.getMonth()]} ${startDate.getDate()} - ${months[endDate.getMonth()]} ${endDate.getDate()}, ${endDate.getFullYear()}`;
};

export const getWeeks = (dates: Date[]) => {
  const weeks: Date[][] = [];
  for (let i = 0; i < dates.length; i += 7) {
    weeks.push(dates.slice(i, i + 7));
  }
  return weeks;
};

export const generateHourLabels = (start: string, end: string) => {
  const startH = parseInt(start.split(":")[0]);
  const endH = parseInt(end.split(":")[0]);
  const hours: number[] = [];
  for (let h = startH; h <= endH; h++) {
    hours.push(h);
  }
  return hours;
};

export const hourLabel = (hour: number) => {
  const h = hour % 24;
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
};

export const formatHour24 = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export const slotEndForHour = (hour: number, shiftLengthHours: number = 8.5) => {
  const totalMins = (hour * 60 + Math.round(shiftLengthHours * 60)) % 1440;
  return `${String(Math.floor(totalMins / 60)).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`;
};

export const GROUP_COLORS = ["tc0", "tc1", "tc2", "tc3", "tc4", "tc5"];
export const GROUP_COLOR_HEX: Record<string, string> = {
  tc0: "#2563eb",
  tc1: "#0891b2",
  tc2: "#059669",
  tc3: "#d97706",
  tc4: "#db2777",
  tc5: "#7c3aed",
};
