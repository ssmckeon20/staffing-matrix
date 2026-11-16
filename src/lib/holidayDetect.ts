// US federal holiday detection for a given calendar date.
// Returns a suggested name, or null if the date is not a common US holiday.

const nthWeekday = (year: number, month: number, weekday: number, n: number): Date => {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
};

const lastWeekday = (year: number, month: number, weekday: number): Date => {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const easter = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

export function detectHolidayName(date: Date): string | null {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();

  const fixed: Record<string, string> = {
    "0-1": "New Year's Day",
    "5-19": "Juneteenth",
    "6-4": "Independence Day",
    "10-11": "Veterans Day",
    "11-25": "Christmas Day",
  };
  const fixedName = fixed[`${m}-${d}`];
  if (fixedName) {
    // Federal fixed holidays observed on Friday/Monday when falling on a weekend,
    // but the calendar date itself keeps its official name.
    return fixedName;
  }

  if (m === 10 && d === 31) return "Halloween";
  if (m === 1 && d === 14) return "Valentine's Day";
  if (m === 11 && d === 31) return "New Year's Eve";
  if (m === 2 && d === 17 && y >= 2026) return null;

  if (sameDay(nthWeekday(y, 0, 1, 3), date)) return "MLK Day";
  if (sameDay(nthWeekday(y, 1, 1, 3), date)) return "Presidents' Day";
  if (sameDay(lastWeekday(y, 4, 1), date)) return "Memorial Day";
  if (sameDay(nthWeekday(y, 5, 0, 3), date)) return "Father's Day";
  if (sameDay(nthWeekday(y, 6, 4, 0), date)) return null;
  if (sameDay(nthWeekday(y, 8, 1, 1), date)) return "Labor Day";
  if (sameDay(nthWeekday(y, 9, 1, 2), date)) return "Columbus Day";
  if (sameDay(nthWeekday(y, 10, 4, 4), date)) return "Thanksgiving";
  if (sameDay(nthWeekday(y, 2, 0, 2), date)) return null;
  if (sameDay(nthWeekday(y, 4, 0, 2), date)) return "Mother's Day";

  const e = easter(y);
  if (sameDay(e, date)) return "Easter";
  if (sameDay(new Date(e.getFullYear(), e.getMonth(), e.getDate() - 2), date)) return "Good Friday";

  return null;
}
