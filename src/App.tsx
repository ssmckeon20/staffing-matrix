import { Fragment, useMemo, useState, type ReactNode } from "react";

type IconName =
  | "calendar"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "clock"
  | "history"
  | "layout"
  | "lightbulb"
  | "plus"
  | "print"
  | "search"
  | "settings"
  | "sparkles"
  | "sliders"
  | "team"
  | "upload"
  | "x";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    calendar: <><path d="M8 2v4M16 2v4M3 10h18" /><rect x="3" y="4" width="18" height="18" rx="2" /></>,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    layout: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    lightbulb: <><path d="M9 18h6M10 22h4" /><path d="M8.4 15.2A7 7 0 1 1 15.6 15c-.9.7-1.4 1.7-1.6 3h-4c-.2-1.2-.7-2.2-1.6-2.8Z" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    print: <><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1-2.6 2.6-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V21h-3.6v-.2A2 2 0 0 0 9 19a2 2 0 0 0-2.2.4l-.1.1-2.6-2.6.1-.1A2 2 0 0 0 4.6 15a2 2 0 0 0-1.8-1.2H3v-3.6h.2A2 2 0 0 0 5 9a2 2 0 0 0-.4-2.2l-.1-.1 2.6-2.6.1.1A2 2 0 0 0 9 4.6a2 2 0 0 0 1.2-1.8V3h3.6v.2A2 2 0 0 0 15 5a2 2 0 0 0 2.2-.4l.1-.1 2.6 2.6-.1.1a2 2 0 0 0-.4 1.8 2 2 0 0 0 1.8 1.2h.2v3.6h-.2A2 2 0 0 0 19.4 15Z" /></>,
    sparkles: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" /><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14ZM5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14Z" /></>,
    sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4.6V20" /></>,
    upload: <><path d="M12 16V3m0 0L7 8m5-5 5 5" /><path d="M4 15v5h16v-5" /></>,
    x: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Button({ children, variant = "secondary", icon, onClick, className = "" }: { children?: ReactNode; variant?: "primary" | "secondary" | "ghost" | "icon"; icon?: IconName; onClick?: () => void; className?: string }) {
  return <button className={`button button-${variant} ${className}`} onClick={onClick}>{icon && <Icon name={icon} />}{children}</button>;
}

const days = [
  { day: "Mon", date: "Sep 7" }, { day: "Tue", date: "Sep 8" }, { day: "Wed", date: "Sep 9" },
  { day: "Thu", date: "Sep 10" }, { day: "Fri", date: "Sep 11" }, { day: "Sat", date: "Sep 12", weekend: true },
  { day: "Sun", date: "Sep 13", weekend: true }, { day: "Mon", date: "Sep 14" }, { day: "Tue", date: "Sep 15" },
  { day: "Wed", date: "Sep 16" }, { day: "Thu", date: "Sep 17" }, { day: "Fri", date: "Sep 18" },
  { day: "Sat", date: "Sep 19", weekend: true }, { day: "Sun", date: "Sep 20", weekend: true },
];
const hours = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  label: hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`,
}));

type Duty = string;
type Status = "Productive" | "Training" | "Open Shift";
type ScheduleRow = { duty: Duty; status: Status; homeShift: string; name: string; shifts: string[] };

const INITIAL_TEAMS = ["Pool", "Emergency Department Transporter", "Equipment Transporter"];
const OFF = "Off";

const TEAM_COLORS = ["tc0", "tc1", "tc2", "tc3", "tc4", "tc5"];
const statusClass = (status: Status) => ({ "Productive": "productive", "Training": "training", "Open Shift": "open-shift" })[status];

const makeShifts = (homeShift: string, workingDays: number[], overrides: Record<number, string> = {}) =>
  days.map((_, index) => overrides[index] ?? (workingDays.includes(index) ? homeShift : OFF));

const initialSchedule: ScheduleRow[] = [
  { duty: "Pool", status: "Productive", homeShift: "7:00 AM - 3:30 PM", name: "Sheral Jones", shifts: makeShifts("7:00 AM - 3:30 PM", [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) },
  { duty: "Pool", status: "Productive", homeShift: "7:00 AM - 3:30 PM", name: "William Laman", shifts: makeShifts("7:00 AM - 3:30 PM", [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) },
  { duty: "Pool", status: "Productive", homeShift: "7:00 AM - 3:30 PM", name: "Nilda Milan", shifts: makeShifts("7:00 AM - 3:30 PM", [1, 2, 3, 4, 5, 8, 9, 10, 11, 12], { 5: "8:00 AM - 4:30 PM", 12: "8:00 AM - 4:30 PM" }) },
  { duty: "Pool", status: "Productive", homeShift: "7:00 AM - 3:30 PM", name: "Sadie Wentworth", shifts: makeShifts("7:00 AM - 3:30 PM", [0, 1, 2, 3, 6, 7, 8, 9, 10, 13], { 6: "9:00 AM - 5:30 PM", 13: "9:00 AM - 5:30 PM" }) },
  { duty: "Pool", status: "Productive", homeShift: "7:00 AM - 3:30 PM", name: "Deidra Hopkins", shifts: makeShifts("7:00 AM - 3:30 PM", [0, 1, 2, 4, 5, 7, 8, 9, 11, 12]) },
  { duty: "Pool", status: "Productive", homeShift: "8:00 AM - 4:30 PM", name: "Michael Correa", shifts: makeShifts("8:00 AM - 4:30 PM", [0, 2, 4, 6, 7, 9, 11, 13]) },
  { duty: "Pool", status: "Open Shift", homeShift: "8:00 AM - 4:30 PM", name: "OPEN - Transporter", shifts: makeShifts("8:00 AM - 4:30 PM", [1, 3, 5, 8, 10, 12]) },
  { duty: "Pool", status: "Productive", homeShift: "9:00 AM - 5:30 PM", name: "Aline Louis", shifts: makeShifts("9:00 AM - 5:30 PM", [0, 1, 3, 4, 7, 8, 10, 11]) },
  { duty: "Pool", status: "Productive", homeShift: "9:00 AM - 5:30 PM", name: "Stephanie Millien", shifts: makeShifts("9:00 AM - 5:30 PM", [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) },
  { duty: "Pool", status: "Productive", homeShift: "11:00 AM - 7:30 PM", name: "Wesley Bullock", shifts: makeShifts("11:00 AM - 7:30 PM", [0, 1, 2, 3, 5, 7, 8, 9, 10, 12]) },
  { duty: "Pool", status: "Productive", homeShift: "11:00 AM - 7:30 PM", name: "Alyssa Heslin", shifts: makeShifts("11:00 AM - 7:30 PM", [0, 1, 2, 4, 6, 7, 8, 9, 11, 13]) },
  { duty: "Pool", status: "Productive", homeShift: "1:30 PM - 10:00 PM", name: "Jeanty Demas", shifts: makeShifts("1:30 PM - 10:00 PM", [0, 1, 2, 3, 5, 7, 8, 9, 10, 12]) },
  { duty: "Pool", status: "Productive", homeShift: "1:30 PM - 10:00 PM", name: "Michee Louissaint", shifts: makeShifts("1:30 PM - 10:00 PM", [0, 1, 3, 4, 6, 7, 9, 10, 11, 13], { 6: "3:30 PM - 12:00 AM", 13: "3:30 PM - 12:00 AM" }) },
  { duty: "Pool", status: "Productive", homeShift: "3:00 PM - 9:00 PM", name: "Jeffery Ambroise", shifts: makeShifts("3:00 PM - 9:00 PM", [0, 1, 2, 4, 6, 7, 8, 9, 11, 13], { 6: "7:00 AM - 3:30 PM", 13: "7:00 AM - 3:30 PM" }) },
  { duty: "Emergency Department Transporter", status: "Productive", homeShift: "6:00 AM - 2:30 PM", name: "Valerie Anderson", shifts: makeShifts("6:00 AM - 2:30 PM", [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) },
  { duty: "Emergency Department Transporter", status: "Productive", homeShift: "8:00 AM - 4:30 PM", name: "Moshe Rojas", shifts: makeShifts("8:00 AM - 4:30 PM", [0, 2, 4, 5, 7, 9, 11, 12]) },
  { duty: "Emergency Department Transporter", status: "Productive", homeShift: "3:00 PM - 11:30 PM", name: "Claude Pierre-Charles", shifts: makeShifts("3:00 PM - 11:30 PM", [0, 1, 2, 3, 6, 7, 8, 9, 10, 13]) },
  { duty: "Emergency Department Transporter", status: "Productive", homeShift: "10:00 PM - 6:30 AM", name: "Franklyn Simmonds", shifts: makeShifts("10:00 PM - 6:30 AM", [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) },
];

const shiftOptions = [
  OFF, "PTO", "LOA", "6:00 AM - 2:30 PM", "6:30 AM - 3:00 PM", "7:00 AM - 3:30 PM", "8:00 AM - 4:30 PM",
  "9:00 AM - 5:30 PM", "11:00 AM - 7:30 PM", "1:30 PM - 10:00 PM", "3:00 PM - 9:00 PM",
  "3:00 PM - 11:30 PM", "3:30 PM - 12:00 AM", "10:00 PM - 6:30 AM",
];

const slotEndForHour = (hour: number) => {
  const totalMins = (hour * 60 + 510) % 1440;
  return `${String(Math.floor(totalMins / 60)).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`;
};

const to24 = (token: string) => {
  const m = token.trim().match(/(\d+):(\d+) (AM|PM)/);
  if (!m) return token;
  let h = Number(m[1]);
  if (m[3] === "PM" && h !== 12) h += 12;
  if (m[3] === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

const compactShift = (shift: string) => {
  if ([OFF, "PTO", "LOA"].includes(shift)) return shift;
  const parts = shift.split(" - ");
  if (parts.length < 2) return shift;
  return `${to24(parts[0])}-${to24(parts[1])}`;
};

const coversHour = (shift: string, hour: number) => {
  if ([OFF, "PTO", "LOA"].includes(shift)) return false;
  const parts = shift.split(" - ");
  if (parts.length < 2) return false;
  return true;
};

const timeValue = (value: string) => {
  const match = value.match(/(\d+):(\d+) (AM|PM)/);
  if (!match) return 0;
  const h = Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0);
  return h + Number(match[2]) / 60;
};

const shiftRange = (shift: string) => {
  if ([OFF, "PTO", "LOA"].includes(shift)) return null;
  const parts = shift.split(" - ");
  if (parts.length < 2) return null;
  return { start: timeValue(parts[0]), end: timeValue(parts[1]) };
};

const shiftDuration = (shift: string) => {
  const r = shiftRange(shift);
  if (!r) return 0;
  const raw = r.end > r.start ? r.end - r.start : r.end + 24 - r.start;
  return Math.round(raw * 10) / 10;
};

const totalScheduledHours = (person: ScheduleRow) =>
  person.shifts.reduce((sum, s) => sum + shiftDuration(s), 0);

const isActiveAt = (person: ScheduleRow, dayIndex: number, hour: number) => {
  if (person.status !== "Productive") return false;
  const current = shiftRange(person.shifts[dayIndex]);
  const previous = dayIndex > 0 ? shiftRange(person.shifts[dayIndex - 1]) : null;
  const activeFromCurrent = current && (current.end > current.start
    ? hour >= current.start && hour < current.end
    : hour >= current.start);
  const activeFromPrevious = previous && previous.end <= previous.start && hour < previous.end;
  return Boolean(activeFromCurrent || activeFromPrevious);
};

const coversEleven = (shift: string) => {
  const r = shiftRange(shift);
  if (!r) return false;
  return r.end > r.start ? 11 >= r.start && 11 < r.end : 11 >= r.start;
};

const defaultVolume = [4, 4, 4, 4, 4, 4, 8, 14, 18, 20, 22, 24, 26, 26, 22, 20, 16, 12, 8, 6, 6, 4, 4, 4];

const formatShiftStart = (homeShift: string) => {
  const match = homeShift.split(" - ")[0].match(/(\d+):(\d+) (AM|PM)/);
  if (!match) return homeShift;
  let h = Number(match[1]);
  if (match[3] === "PM" && h !== 12) h += 12;
  if (match[3] === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${match[2]}`;
};

const timeToInput = (token: string) => {
  const tv = timeValue(token);
  if (!tv && tv !== 0) return "";
  const h = Math.floor(tv);
  const m = Math.round((tv - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const inputToShiftTime = (val: string) => {
  if (!val) return OFF;
  const [hStr, mStr] = val.split(":");
  const h = Number(hStr);
  const m = Number(mStr || 0);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
};

const neededAt = (hour: number, weekend: boolean, volume: number[], rate: number) => {
  const v = weekend ? Math.round(volume[hour] * 0.65) : volume[hour];
  return Math.max(1, Math.ceil(v / Math.max(0.1, rate)));
};

function App() {
  const [view, setView] = useState<"matrix" | "employee" | "team" | "history">("matrix");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [matrixMode, setMatrixMode] = useState<"schedule" | "volume">("schedule");
  const [matrixTeam, setMatrixTeam] = useState<string>("all");
  const [schedule, setSchedule] = useState(initialSchedule);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(0);
  const [editingDays, setEditingDays] = useState<number[]>([0]);
  const [editingStartTime, setEditingStartTime] = useState("06:30");
  const [editingEndTime, setEditingEndTime] = useState("15:00");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [volumePlan, setVolumePlan] = useState<number[]>(defaultVolume);
  const [productivityRate, setProductivityRate] = useState(2);
  const [opsStart, setOpsStart] = useState("06:00");
  const [opsEnd, setOpsEnd] = useState("22:00");
  const [shiftSlotAdjust, setShiftSlotAdjust] = useState<Record<string, number>>({});
  const [assigningSlot, setAssigningSlot] = useState<{ hour: number; repShift: string } | null>(null);
  const [assignSearch, setAssignSearch] = useState("");
  const [teams, setTeams] = useState<string[]>(INITIAL_TEAMS);
  const [teamSearch, setTeamSearch] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDuty, setNewDuty] = useState<Duty>("");
  const [newStatus, setNewStatus] = useState<Status>("Productive");
  const [newStartTime, setNewStartTime] = useState("07:00");
  const [newEndTime, setNewEndTime] = useState("15:30");
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberDuty, setMemberDuty] = useState<Duty>("");
  const [memberStatus, setMemberStatus] = useState<Status>("Productive");
  const [memberStartTime, setMemberStartTime] = useState("07:00");
  const [memberEndTime, setMemberEndTime] = useState("15:30");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [renamingTeam, setRenamingTeam] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const dutyClass = (duty: string) => TEAM_COLORS[teams.indexOf(duty) % TEAM_COLORS.length] ?? "tc0";

  const hourlyStaffing = useMemo(() => hours.map(({ hour }) => days.map((_, dayIndex) =>
    schedule.filter((person) => isActiveAt(person, dayIndex, hour)).length
  )), [schedule]);

  const opsHours = useMemo(() => {
    const sh = Number(opsStart.split(":")[0]) + Number(opsStart.split(":")[1]) / 60;
    const eh = Number(opsEnd.split(":")[0]) + Number(opsEnd.split(":")[1]) / 60;
    return hours.filter(({ hour }) => hour >= Math.floor(sh) && hour <= Math.floor(eh));
  }, [opsStart, opsEnd]);

  const requiredByHourDay = useMemo(() => hours.map(({ hour }) =>
    days.map((day) => neededAt(hour, Boolean(day.weekend), volumePlan, productivityRate))
  ), [volumePlan, productivityRate]);

  const peakCounts = hourlyStaffing[11];
  const requiredAtPeak = requiredByHourDay[11];
  const coverage = Math.round(peakCounts.reduce((total, count, index) => total + Math.min(1, count / requiredAtPeak[index]), 0) / days.length * 100);
  const teamSchedule = matrixTeam === "all" ? schedule : schedule.filter((p) => p.duty === matrixTeam);
  const nonProductiveHours = teamSchedule.filter((p) => p.status !== "Productive").reduce((total, person) => total + person.shifts.filter((shift) => ![OFF, "PTO", "LOA"].includes(shift)).length * 8, 0);
  const openAssignments = teamSchedule.filter((p) => p.status === "Open Shift").reduce((total, person) => total + person.shifts.filter((shift) => shift !== OFF).length, 0);
  const scheduledHours = teamSchedule.filter((p) => p.status === "Productive").reduce((total, person) => total + person.shifts.filter((shift) => ![OFF, "PTO", "LOA"].includes(shift)).length * 8, 0);
  const visibleSchedule = teamSchedule.filter((person) =>
    person.name.toLowerCase().includes(search.toLowerCase()) ||
    person.homeShift.toLowerCase().includes(search.toLowerCase()) ||
    person.duty.toLowerCase().includes(search.toLowerCase()) ||
    person.status.toLowerCase().includes(search.toLowerCase())
  );
  const editingDayRef = editingDays[0] ?? 0;
  const editingShiftStr = editingStartTime && editingEndTime ? `${inputToShiftTime(editingStartTime)} - ${inputToShiftTime(editingEndTime)}` : OFF;
  const currentEditContributes = schedule[editingEmployee].status === "Productive" && coversEleven(schedule[editingEmployee].shifts[editingDayRef]);
  const nextEditContributes = schedule[editingEmployee].status === "Productive" && coversEleven(editingShiftStr);
  const editedPeakCoverage = peakCounts[editingDayRef] + Number(nextEditContributes) - Number(currentEditContributes);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const applySuggestion = () => {
    setSchedule((current) => current.map((person) => person.name === "Sadie Wentworth" ? { ...person, shifts: person.shifts.map((shift, day) => day === 5 ? "11:00 AM - 7:30 PM" : shift) } : person));
    notify("Recommendation applied to draft");
  };

  const openEditor = (employeeIndex: number, dayIndex: number) => {
    setEditingEmployee(employeeIndex);
    setEditingDays([dayIndex]);
    const shift = schedule[employeeIndex].shifts[dayIndex];
    if (shift && ![OFF, "PTO", "LOA"].includes(shift)) {
      const parts = shift.split(" - ");
      setEditingStartTime(parts[0] ? timeToInput(parts[0]) : "");
      setEditingEndTime(parts[1] ? timeToInput(parts[1]) : "");
    } else {
      setEditingStartTime("");
      setEditingEndTime("");
    }
    setEditorOpen(true);
  };

  const saveShift = () => {
    const newShift = editingStartTime && editingEndTime
      ? `${inputToShiftTime(editingStartTime)} - ${inputToShiftTime(editingEndTime)}`
      : OFF;
    setSchedule((current) => current.map((person, personIndex) => personIndex === editingEmployee
      ? { ...person, shifts: person.shifts.map((shift, dayIndex) => editingDays.includes(dayIndex) ? newShift : shift) }
      : person));
    setEditorOpen(false);
    notify(`${schedule[editingEmployee].name}'s shift updated for ${editingDays.length} day${editingDays.length > 1 ? "s" : ""}`);
  };

  const removeShift = () => {
    setSchedule((current) => current.map((person, personIndex) => personIndex === editingEmployee
      ? { ...person, shifts: person.shifts.map((shift, dayIndex) => editingDays.includes(dayIndex) ? OFF : shift) }
      : person));
    setEditorOpen(false);
    notify(`Shift removed for ${schedule[editingEmployee].name}`);
  };

  const updateStatus = (employeeIndex: number, status: Status) => {
    setSchedule((current) => current.map((person, i) => i === employeeIndex ? { ...person, status } : person));
    const name = schedule[employeeIndex].name;
    notify(status === "Productive" ? `${name} marked as Productive` : `${name} set to ${status} - excluded from coverage`);
  };

  const updateVolume = (hour: number, raw: string) => {
    const val = Math.max(0, Math.round(Number(raw) || 0));
    setVolumePlan((v) => v.map((x, i) => i === hour ? val : x));
  };

  const slotKey = (hour: number) => `${matrixTeam}:${hour}`;

  const getShiftSlots = (hour: number) => {
    const needed = neededAt(hour, false, volumePlan, productivityRate);
    const actualProductive = teamSchedule.filter((p) => Math.floor(timeValue(p.homeShift.split(" - ")[0])) === hour && p.status === "Productive").length;
    const adjust = shiftSlotAdjust[slotKey(hour)] ?? 0;
    return Math.max(actualProductive, Math.max(0, needed + adjust));
  };

  const removeEmployee = (name: string) => {
    setSchedule((prev) => prev.filter((p) => p.name !== name));
    notify(`${name} removed from the team`);
  };

  const addMember = () => {
    if (!newName.trim()) return;
    const homeShift = newStartTime && newEndTime ? `${inputToShiftTime(newStartTime)} - ${inputToShiftTime(newEndTime)}` : "7:00 AM - 3:30 PM";
    setSchedule((prev) => [...prev, { duty: newDuty, status: newStatus, homeShift, name: newName.trim(), shifts: Array(14).fill(OFF) }]);
    notify(`${newName.trim()} added to the team`);
    setAddingMember(false);
    setNewName("");
    setNewDuty(teams[0] ?? "");
    setNewStatus("Productive");
    setNewStartTime("07:00");
    setNewEndTime("15:30");
  };

  const openMemberEdit = (person: typeof schedule[0]) => {
    setMemberName(person.name);
    setMemberDuty(person.duty);
    setMemberStatus(person.status);
    const parts = person.homeShift.split(" - ");
    setMemberStartTime(parts[0] ? timeToInput(parts[0]) : "07:00");
    setMemberEndTime(parts[1] ? timeToInput(parts[1]) : "15:30");
    setEditingMember(person.name);
  };

  const closeMemberModal = () => { setEditingMember(null); setConfirmingRemove(false); };

  const saveMemberEdit = () => {
    if (!editingMember) return;
    const homeShift = memberStartTime && memberEndTime ? `${inputToShiftTime(memberStartTime)} - ${inputToShiftTime(memberEndTime)}` : "7:00 AM - 3:30 PM";
    setSchedule((prev) => prev.map((p) => p.name === editingMember
      ? { ...p, name: memberName.trim() || p.name, duty: memberDuty, status: memberStatus, homeShift }
      : p));
    notify(`${memberName.trim()} updated`);
    closeMemberModal();
  };

  const createTeam = () => {
    const name = newTeamName.trim();
    if (!name || teams.includes(name)) return;
    setTeams((prev) => [...prev, name]);
    setCreatingTeam(false);
    setNewTeamName("");
    notify(`Team "${name}" created`);
  };

  const renameTeam = () => {
    if (!renamingTeam) return;
    const name = renameValue.trim();
    if (!name || (name !== renamingTeam && teams.includes(name))) { notify("That name is already in use"); return; }
    setTeams((prev) => prev.map((t) => t === renamingTeam ? name : t));
    setSchedule((prev) => prev.map((p) => p.duty === renamingTeam ? { ...p, duty: name } : p));
    setRenamingTeam(null);
    notify(`Team renamed to "${name}"`);
  };

  const deleteTeam = (name: string) => {
    if (schedule.some((p) => p.duty === name)) { notify("Move all members to another team before deleting"); return; }
    setTeams((prev) => prev.filter((t) => t !== name));
    notify(`Team "${name}" deleted`);
  };

  const adjustSlots = (hour: number, delta: number) => {
    const k = slotKey(hour);
    setShiftSlotAdjust((prev) => ({ ...prev, [k]: (prev[k] ?? 0) + delta }));
  };

  const openAssignPanel = (hour: number) => {
    const member = schedule.find((p) => Math.floor(timeValue(p.homeShift.split(" - ")[0])) === hour && p.homeShift.includes(" - "));
    const repShift = member?.homeShift ?? (() => {
      const fmt = (h: number, m: number) => { const p = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2, "0")} ${p}`; };
      return `${fmt(hour, 0)} - ${fmt((hour + 8) % 24, 30)}`;
    })();
    setAssigningSlot({ hour, repShift });
    setAssignSearch("");
  };

  const confirmAssign = (name: string, isNew: boolean) => {
    if (!assigningSlot) return;
    const { hour, repShift } = assigningSlot;
    if (isNew) {
      setSchedule((prev) => [...prev, { duty: teams[0] ?? "", status: "Productive" as Status, homeShift: repShift, name: name.trim(), shifts: Array(14).fill(OFF) }]);
    } else {
      setSchedule((prev) => prev.map((p) => p.name === name ? { ...p, homeShift: repShift, status: "Productive" as Status } : p));
    }
    notify(`${name.trim()} assigned to ${String(hour).padStart(2, "0")}:00 shift`);
    setAssigningSlot(null);
    setAssignSearch("");
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Icon name="layout" size={20} /></div>
          <span>Shiftline</span>
          <button className="sidebar-toggle" onClick={() => setSidebarCollapsed((c) => !c)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <Icon name={sidebarCollapsed ? "chevronRight" : "chevronLeft"} size={14} />
          </button>
        </div>
        <div className="facility"><span className="eyebrow">Department</span><strong>Patient Transportation</strong><small>Texas Health Dallas</small></div>
        <nav className="nav-list" aria-label="Primary navigation">
          <button className={view === "matrix" ? "nav-item active" : "nav-item"} onClick={() => setView("matrix")} title="Staffing matrix"><Icon name="layout" /><span>Staffing matrix</span></button>
          <button className={view === "employee" ? "nav-item active" : "nav-item"} onClick={() => setView("employee")} title="Employee schedule"><Icon name="calendar" /><span>Employee schedule</span></button>
          <button className={view === "team" ? "nav-item active" : "nav-item"} onClick={() => setView("team")} title="Team"><Icon name="team" /><span>Team</span></button>
          <button className={view === "history" ? "nav-item active" : "nav-item"} onClick={() => setView("history")} title="Change history"><Icon name="history" /><span>Change history</span></button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" title="Settings"><Icon name="settings" /><span>Settings</span></button>
          <div className="user-card"><div className="avatar">AM</div><div><strong>Avery Morgan</strong><small>Schedule manager</small></div><Icon name="chevronDown" size={16} /></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">Shiftline</div>
          <div className="search"><Icon name="search" size={17} /><input aria-label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search schedules or employees" /></div>
          <div className="top-actions"><span className="saved-status"><span />Draft saved</span><Button icon="upload" onClick={() => notify("Master Schedule is ready to sync")}>Import data</Button><Button variant="primary" icon="plus" onClick={() => openEditor(0, 0)}>Add shift</Button></div>
        </header>

        {view === "matrix" && (
          <div className="page">
            <section className="page-heading">
              <div><div className="title-row"><h1>Staffing matrix</h1><span className="status-pill">Draft</span></div><p>Build a schedule around expected transport demand.</p></div>
              <div className="heading-actions"><Button variant="icon" icon="chevronLeft" /><button className="date-control"><Icon name="calendar" /><span>Sep 7 - Sep 20, 2026</span><Icon name="chevronDown" size={16} /></button><Button variant="icon" icon="chevronRight" /><Button icon="print" onClick={() => setView("employee")}>Preview and print</Button></div>
            </section>

            <section className="metrics">
              <article className="metric"><div className="metric-top"><span>Coverage</span><span className="trend good">+3.2%</span></div><div className="metric-value">{coverage}%</div><div className="progress"><span style={{ width: `${coverage}%` }} /></div><small>vs. 92% last schedule</small></article>
              <article className="metric"><div className="metric-top"><span>Productive hours</span><Icon name="clock" /></div><div className="metric-value">{scheduledHours.toLocaleString()}</div><small>{nonProductiveHours ? <><strong>{nonProductiveHours}</strong> non-productive hours excluded</> : <>Across <strong>{schedule.length}</strong> schedule lines</>}</small></article>
              <article className="metric"><div className="metric-top"><span>Open assignments</span><span className="attention-dot" /></div><div className="metric-value">{openAssignments}</div><small>Visible directly in the matrix</small></article>
              <article className="metric ai-metric"><div className="metric-top"><span>AI confidence</span><Icon name="sparkles" /></div><div className="metric-value">High</div><small>Based on 18 prior schedules</small></article>
            </section>

            <section className="matrix-card detailed-matrix-card">
              <div className="matrix-team-tabs">
                <button className={matrixTeam === "all" ? "matrix-team-tab active" : "matrix-team-tab"} onClick={() => setMatrixTeam("all")}>All teams</button>
                {teams.map((t, i) => (
                  <button key={t} className={`matrix-team-tab ${matrixTeam === t ? "active" : ""} ${TEAM_COLORS[i % TEAM_COLORS.length]}`} onClick={() => setMatrixTeam(t)}>{t}</button>
                ))}
              </div>
              <div className="card-header matrix-toolbar">
                <div>
                  <h2>{matrixMode === "schedule" ? (matrixTeam === "all" ? "Staff schedule — All teams" : matrixTeam) : "Volume planning"}</h2>
                  <p>{matrixMode === "schedule" ? `${teamSchedule.length} members · assignments grouped by shift time` : "Set expected transport volume and productivity rate to calculate staffing needs."}</p>
                </div>
                <div className="matrix-controls">
                  <div className="view-toggle">
                    <button className={matrixMode === "schedule" ? "active" : ""} onClick={() => setMatrixMode("schedule")}>By shift</button>
                    <button className={matrixMode === "volume" ? "active" : ""} onClick={() => setMatrixMode("volume")}><Icon name="sliders" size={13} />Volume plan</button>
                  </div>
                  {matrixMode === "schedule" && (
                    <div className="legend"><span><i className="legend-good" />Covered</span><span><i className="legend-low" />Gap</span><span><i className="legend-training" />Non-productive excluded</span></div>
                  )}
                </div>
              </div>

              {matrixMode === "schedule" && (
                <>
                  <div className="schedule-scroll">
                    <table className="schedule-matrix">
                      <thead>
                        <tr className="week-band"><th colSpan={2}>Shift and staff</th><th colSpan={7}>Week 1</th><th colSpan={7}>Week 2</th></tr>
                        <tr><th>Status</th><th>Team member</th>{days.map((day) => <th key={day.date} className={day.weekend ? "weekend" : ""}><strong>{day.day}</strong><span>{day.date.replace("Sep ", "")}</span></th>)}</tr>
                      </thead>
                      <tbody>
                        {opsHours.map(({ hour }) => {
                          const hourLabel = `${String(hour).padStart(2, "0")}:00`;
                          const shiftMembers = visibleSchedule.filter((p) => Math.floor(timeValue(p.homeShift.split(" - ")[0])) === hour);
                          const allProductive = schedule.filter((p) => Math.floor(timeValue(p.homeShift.split(" - ")[0])) === hour && p.status === "Productive").length;
                          const totalSlots = getShiftSlots(hour);
                          const openSlotCount = Math.max(0, totalSlots - allProductive);
                          if (shiftMembers.length === 0 && openSlotCount === 0) return null;
                          const representativeShift = shiftMembers[0]?.homeShift ?? "";
                          return (
                            <Fragment key={hour}>
                              <tr className="shift-header-row">
                                <td colSpan={16}>
                                  <span className="shift-name">{hourLabel}</span>
                                  <span className="shift-count">{allProductive} assigned · {totalSlots} slots needed</span>
                                  <button className="shift-add-btn" onClick={() => adjustSlots(hour, 1)} aria-label="Add slot">
                                    <Icon name="plus" size={11} />Add slot
                                  </button>
                                </td>
                              </tr>
                              {shiftMembers.map((person) => {
                                const personIndex = schedule.indexOf(person);
                                return (
                                  <tr key={person.name} className={`employee-row ${person.status === "Open Shift" ? "open-row" : ""} ${person.status !== "Productive" ? "nonproductive-row" : ""}`}>
                                    <td>
                                      <select className={`status-select ${statusClass(person.status)}`} value={person.status} onChange={(event) => updateStatus(personIndex, event.target.value as Status)} aria-label={`Status for ${person.name}`}>
                                        <option>Productive</option>
                                        <option>Training</option>
                                        <option>Open Shift</option>
                                      </select>
                                    </td>
                                    <td className="name-cell">
                                      <div className="name-cell-inner">
                                        <strong>{person.name}</strong>
                                        <span className="employee-hours">{totalScheduledHours(person).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} hrs scheduled</span>
                                      </div>
                                      <button className="row-delete-btn" onClick={() => removeEmployee(person.name)} aria-label={`Remove ${person.name}`} title="Remove from schedule">&#x2715;</button>
                                    </td>
                                    {person.shifts.map((shift, dayIndex) => {
                                      const shiftEnd = shift.split(" - ")[1];
                                      const cellLabel = shift === OFF ? "-" : (shift === "PTO" || shift === "LOA") ? shift : shiftEnd ? `${hourLabel}-${to24(shiftEnd)}` : compactShift(shift);
                                      return (
                                        <td key={days[dayIndex].date} className={days[dayIndex].weekend ? "weekend" : ""}>
                                          <button className={`shift-cell ${shift === OFF ? "off" : shift === "PTO" || shift === "LOA" ? "leave" : ""}`} onClick={() => openEditor(personIndex, dayIndex)} aria-label={`Edit ${person.name}, ${days[dayIndex].date}`}>
                                            <span>{cellLabel}</span>
                                          </button>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                              {Array.from({ length: openSlotCount }, (_, i) => (
                                <tr key={`open-${hour}-${i}`} className="open-slot-row">
                                  <td className="open-slot-status-cell"><span className="open-slot-badge">Open</span></td>
                                  <td className="name-cell open-slot-name-cell">
                                    <button className="assign-slot-btn" onClick={() => openAssignPanel(hour)}>
                                      <Icon name="plus" size={13} />Assign employee
                                    </button>
                                    <button className="row-delete-btn" onClick={() => adjustSlots(hour, -1)} aria-label="Remove open slot" title="Remove this slot">&#x2715;</button>
                                  </td>
                                  {days.map((day) => (
                                    <td key={day.date} className={`open-slot-day ${day.weekend ? "weekend" : ""}`}>
                                      <button className="shift-cell open-slot-shift" onClick={() => notify("Use Add shift to assign someone to this open slot")}>
                                        <span>{`${hourLabel}-${slotEndForHour(hour)}`}</span>
                                      </button>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                              <tr className="shift-subtotal-row">
                                <td colSpan={2} className="shift-subtotal-label">Staff at {hourLabel}</td>
                                {days.map((day, d) => {
                                  const working = teamSchedule.filter((p) => isActiveAt(p, d, hour)).length;
                                  const needed = neededAt(hour, Boolean(day.weekend), volumePlan, productivityRate);
                                  const cls = working === 0 ? "zero" : working < needed ? "partial" : "full";
                                  return (
                                    <td key={day.date} className={`shift-subtotal-cell ${day.weekend ? "weekend" : ""} ${cls}`}>
                                      <strong>{working}</strong>
                                      <span>/{needed}</span>
                                    </td>
                                  );
                                })}
                              </tr>
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {matrixMode === "volume" && (
                <div className="volume-plan-wrap">
                  <div className="volume-settings-bar">
                    <div className="volume-setting">
                      <div>
                        <span className="vs-label">Hours of operation</span>
                        <span className="vs-hint">Only hours within this window appear in the grid below</span>
                      </div>
                      <div className="ops-time-pair">
                        <div className="ops-time-field">
                          <label htmlFor="ops-start" className="ops-time-label">Start</label>
                          <input id="ops-start" type="time" value={opsStart} onChange={(e) => setOpsStart(e.target.value)} className="time-input" />
                        </div>
                        <span className="ops-time-sep">to</span>
                        <div className="ops-time-field">
                          <label htmlFor="ops-end" className="ops-time-label">End</label>
                          <input id="ops-end" type="time" value={opsEnd} onChange={(e) => setOpsEnd(e.target.value)} className="time-input" />
                        </div>
                      </div>
                    </div>
                    <div className="vs-divider" />
                    <div className="volume-setting">
                      <label htmlFor="prod-rate">
                        <span className="vs-label">Transports per transporter per hour</span>
                        <span className="vs-hint">Used to calculate staffing need from volume</span>
                      </label>
                      <input
                        id="prod-rate"
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={productivityRate}
                        onChange={(e) => setProductivityRate(Math.max(0.1, Number(e.target.value) || 0.1))}
                        className="rate-input"
                      />
                    </div>
                    <div className="volume-derived">
                      <span>Peak need (11 AM weekday)</span>
                      <strong>{neededAt(11, false, volumePlan, productivityRate)} transporters</strong>
                    </div>
                    <div className="volume-derived">
                      <span>Peak need (11 AM weekend)</span>
                      <strong>{neededAt(11, true, volumePlan, productivityRate)} transporters</strong>
                    </div>
                  </div>
                  <div className="volume-table-scroll">
                    <table className="volume-table">
                      <thead>
                        <tr>
                          <th>Hour</th>
                          <th>Expected transports<span>Weekday</span></th>
                          <th>Transporters needed<span>Weekday</span></th>
                          <th>Expected transports<span>Weekend (65%)</span></th>
                          <th>Transporters needed<span>Weekend</span></th>
                          <th>Volume bar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hours.filter(({ hour }) => {
                          const sh = parseInt(opsStart.split(":")[0]);
                          const eh = parseInt(opsEnd.split(":")[0]);
                          return hour >= sh && hour <= eh;
                        }).map(({ hour, label }) => {
                          const vol = volumePlan[hour];
                          const wdNeed = neededAt(hour, false, volumePlan, productivityRate);
                          const weVol = Math.round(vol * 0.65);
                          const weNeed = neededAt(hour, true, volumePlan, productivityRate);
                          const maxVol = Math.max(...volumePlan, 1);
                          return (
                            <tr key={hour} className={wdNeed > peakCounts.reduce((a, b) => a + b, 0) / days.length ? "vt-gap" : ""}>
                              <td className="vt-hour">{label}</td>
                              <td className="vt-input-cell">
                                <input
                                  type="number"
                                  min="0"
                                  value={vol}
                                  onChange={(e) => updateVolume(hour, e.target.value)}
                                  className="volume-input"
                                  aria-label={`Expected transports at ${label}`}
                                />
                              </td>
                              <td className="vt-need">{wdNeed}</td>
                              <td className="vt-we-vol">{weVol}</td>
                              <td className="vt-need">{weNeed}</td>
                              <td className="vt-bar-cell">
                                <div className="vt-bar-track">
                                  <div className="vt-bar-fill" style={{ width: `${Math.round(vol / maxVol * 100)}%` }} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="matrix-footer"><span>Changes update staffing need across the By Team view in real time</span><span>Productivity rate: {productivityRate} transport{productivityRate !== 1 ? "s" : ""} per transporter per hour</span></div>
                </div>
              )}

              {matrixMode === "schedule" && (
                <div className="matrix-footer"><span>{visibleSchedule.length} of {schedule.length} schedule lines - 14 days</span><span>Click any shift to edit - Last edited 2 min ago</span></div>
              )}
            </section>

            <aside className="insights insights-wide">
                <div className="insights-title"><span className="ai-icon"><Icon name="sparkles" size={17} /></span><div><h2>Schedule insights</h2><p>3 ways to strengthen coverage</p></div></div>
                <article className="insight-card priority"><div className="insight-label"><Icon name="lightbulb" size={15} />Best match</div><h3>Close Saturday midday gap</h3><p>Move Sadie Wentworth's Saturday assignment to 11 AM. This covers peak demand without adding hours.</p><div className="impact"><span>Sat, 12-2 PM</span><strong>+1 coverage</strong></div><div className="insight-actions"><Button variant="primary" onClick={applySuggestion}>Apply change</Button><Button variant="ghost" onClick={() => notify("Suggestion dismissed")}>Dismiss</Button></div></article>
                <article className="insight-card"><div className="insight-label neutral">Pattern found</div><h3>Friday volume runs higher</h3><p>Demand exceeded forecast on 4 of the last 6 Fridays. Consider adding a flex shift.</p><button className="text-action" onClick={() => openEditor(6, 4)}>Review open shifts <Icon name="chevronRight" size={15} /></button></article>
                <article className="insight-card"><div className="insight-label neutral">Weekend</div><h3>Reuse a proven rotation</h3><p>This weekend matches the Aug 22 volume profile. That schedule reached 98% coverage.</p><button className="text-action" onClick={() => notify("Historical schedule loaded for comparison")}>Compare schedule <Icon name="chevronRight" size={15} /></button></article>
                <div className="ai-note"><Icon name="sparkles" size={16} /><p>Suggestions learn from accepted changes and historical demand. You stay in control.</p></div>
            </aside>
          </div>
        )}

        {view === "employee" && (
          <div className="page">
            <section className="page-heading"><div><div className="title-row"><h1>Employee schedule</h1><span className="status-pill published">Ready to post</span></div><p>A clear, employee-first view of the biweekly schedule.</p></div><div className="heading-actions"><Button onClick={() => setView("matrix")}>Back to matrix</Button><Button variant="primary" icon="print" onClick={() => window.print()}>Print schedule</Button></div></section>
            <section className="print-card">
              <div className="print-header"><div><span className="eyebrow">Patient Transportation</span><h2>Weekly team schedule</h2><p>September 7-13, 2026 - Texas Health Dallas</p></div><div className="print-brand">Shiftline</div></div>
              <div className="employee-table-wrap"><table className="employee-table"><thead><tr><th>Team member</th>{days.slice(0, 7).map((day) => <th key={day.date}>{day.day}<span>{day.date}</span></th>)}</tr></thead><tbody>{schedule.filter((person) => person.status !== "Open Shift").slice(0, 10).map((person) => <tr key={person.name}><td><strong>{person.name}</strong><span>{person.duty} - {compactShift(person.homeShift)}</span></td>{person.shifts.slice(0, 7).map((shift, index) => <td key={index} className={shift === OFF ? "off" : ""}>{shift}</td>)}</tr>)}</tbody></table></div>
              <div className="print-note"><strong>Schedule notes</strong><span>Please arrive 10 minutes before your shift. Contact the staffing office for changes or call-outs.</span></div>
            </section>
          </div>
        )}

        {view === "team" && (
          <div className="page">
            <section className="page-heading">
              <div>
                <div className="title-row"><h1>Team</h1><span className="status-pill">{schedule.length} members</span></div>
                <p>Manage team members, roles, and onboarding status.</p>
              </div>
              <div className="heading-actions">
                <Button variant="primary" icon="plus" onClick={() => setAddingMember(true)}>Add team member</Button>
              </div>
            </section>

            <section className="metrics">
              <article className="metric"><div className="metric-top"><span>Total members</span></div><div className="metric-value">{schedule.length}</div><small>Across all teams</small></article>
              <article className="metric"><div className="metric-top"><span>Productive</span><span className="trend good">{Math.round(schedule.filter(p => p.status === "Productive").length / schedule.length * 100)}%</span></div><div className="metric-value">{schedule.filter(p => p.status === "Productive").length}</div><small>Active and on duty</small></article>
              <article className="metric"><div className="metric-top"><span>In training</span></div><div className="metric-value">{schedule.filter(p => p.status === "Training").length}</div><small>Non-productive excluded from coverage</small></article>
              <article className="metric"><div className="metric-top"><span>Open positions</span><span className="attention-dot" /></div><div className="metric-value">{schedule.filter(p => p.status === "Open Shift").length}</div><small>Unfilled slots in schedule</small></article>
            </section>

            <div className="team-mgmt-section">
              <div className="team-mgmt-header">
                <h3>Assignment groups</h3>
                <button className="team-create-btn" onClick={() => { setCreatingTeam(true); setNewTeamName(""); }}>
                  <Icon name="plus" size={13} />New group
                </button>
              </div>
              <div className="team-chips-row">
                {teams.map((t, i) => (
                  <div key={t} className={`team-chip-item ${dutyClass(t)}`}>
                    {renamingTeam === t ? (
                      <input
                        className="team-rename-input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") renameTeam(); if (e.key === "Escape") setRenamingTeam(null); }}
                        autoFocus
                      />
                    ) : (
                      <span className="team-chip-name" onClick={() => { setRenamingTeam(t); setRenameValue(t); }}>{t}</span>
                    )}
                    <span className="team-chip-count">{schedule.filter(p => p.duty === t).length}</span>
                    {renamingTeam === t ? (
                      <>
                        <button className="team-chip-action save" onClick={renameTeam}>Save</button>
                        <button className="team-chip-action cancel" onClick={() => setRenamingTeam(null)}>&#x2715;</button>
                      </>
                    ) : (
                      <button className="team-chip-delete" onClick={() => deleteTeam(t)} title="Delete group">&#x2715;</button>
                    )}
                  </div>
                ))}
                {creatingTeam && (
                  <div className="team-chip-item tc-new">
                    <input
                      className="team-rename-input"
                      placeholder="Group name..."
                      value={newTeamName}
                      onChange={e => setNewTeamName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") createTeam(); if (e.key === "Escape") setCreatingTeam(false); }}
                      autoFocus
                    />
                    <button className="team-chip-action save" onClick={createTeam}>Add</button>
                    <button className="team-chip-action cancel" onClick={() => setCreatingTeam(false)}>&#x2715;</button>
                  </div>
                )}
              </div>
            </div>

            <div className="team-search-bar">
              <Icon name="search" size={16} />
              <input placeholder="Search team members..." value={teamSearch} onChange={(e) => setTeamSearch(e.target.value)} />
            </div>

            {teams.map((duty) => {
              const members = schedule.filter(p => p.duty === duty && (
                !teamSearch || p.name.toLowerCase().includes(teamSearch.toLowerCase())
              ));
              if (members.length === 0 && teamSearch) return null;
              return (
                <section key={duty} className="team-group">
                  <div className="team-group-header">
                    <span className={`team-group-badge ${dutyClass(duty)}`}>{duty}</span>
                    <span className="team-group-count">{members.length} member{members.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="team-member-list">
                    {members.length === 0 ? (
                      <div className="team-empty">No members in this team yet.</div>
                    ) : members.map((person) => {
                      const hrs = totalScheduledHours(person);
                      const initials = person.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                      return (
                        <div key={person.name} className="team-member-card" onClick={() => openMemberEdit(person)}>
                          <div className={`team-avatar ${dutyClass(person.duty)}`}>{initials}</div>
                          <div className="team-member-info">
                            <strong>{person.name}</strong>
                            <span className="team-member-meta">
                              {compactShift(person.homeShift)} &middot; {hrs > 0 ? `${hrs.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs this period` : "No shifts scheduled"}
                            </span>
                          </div>
                          <span className={`team-status-badge ${statusClass(person.status)}`}>{person.status}</span>
                          <button className="team-remove-btn" onClick={(e) => { e.stopPropagation(); removeEmployee(person.name); }} title={`Remove ${person.name}`}>&#x2715;</button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {addingMember && (
              <div className="modal-backdrop" onMouseDown={() => setAddingMember(false)}>
                <div className="modal" onMouseDown={e => e.stopPropagation()}>
                  <div className="modal-head">
                    <div><h2>Add team member</h2><p>New members start with no shifts — assign them in the Staffing matrix.</p></div>
                    <Button variant="icon" icon="x" onClick={() => setAddingMember(false)} />
                  </div>
                  <label>Full name
                    <input placeholder="e.g. Jordan Lee" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addMember()} autoFocus />
                  </label>
                  <label>Team / Role
                    <select value={newDuty} onChange={e => setNewDuty(e.target.value)}>
                      {teams.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </label>
                  <label>Status
                    <select value={newStatus} onChange={e => setNewStatus(e.target.value as Status)}>
                      <option>Productive</option>
                      <option>Training</option>
                      <option>Open Shift</option>
                    </select>
                  </label>
                  <label>Default shift
                    <div className="shift-time-inputs">
                      <div className="shift-time-field"><span>Start</span><input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} /></div>
                      <span className="shift-time-sep">→</span>
                      <div className="shift-time-field"><span>End</span><input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} /></div>
                    </div>
                  </label>
                  <div className="modal-actions">
                    <div />
                    <div className="modal-actions-right">
                      <Button onClick={() => setAddingMember(false)}>Cancel</Button>
                      <Button variant="primary" onClick={addMember}>Add member</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {editingMember && (
              <div className="modal-backdrop" onMouseDown={closeMemberModal}>
                <div className="modal" onMouseDown={e => e.stopPropagation()}>
                  <div className="modal-head">
                    <div><h2>Edit team member</h2><p>Update role, status, and default shift.</p></div>
                    <Button variant="icon" icon="x" onClick={closeMemberModal} />
                  </div>
                  <label>Full name
                    <input value={memberName} onChange={e => setMemberName(e.target.value)} />
                  </label>
                  <label>Team assignment
                    <select value={memberDuty} onChange={e => setMemberDuty(e.target.value)}>
                      {teams.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </label>
                  <label>Status
                    <select value={memberStatus} onChange={e => setMemberStatus(e.target.value as Status)}>
                      <option>Productive</option>
                      <option>Training</option>
                      <option>Open Shift</option>
                    </select>
                  </label>
                  <label>Default shift
                    <div className="shift-time-inputs">
                      <div className="shift-time-field"><span>Start</span><input type="time" value={memberStartTime} onChange={e => setMemberStartTime(e.target.value)} /></div>
                      <span className="shift-time-sep">→</span>
                      <div className="shift-time-field"><span>End</span><input type="time" value={memberEndTime} onChange={e => setMemberEndTime(e.target.value)} /></div>
                    </div>
                  </label>
                  {confirmingRemove ? (
                    <div className="remove-confirm-banner">
                      <p>Remove <strong>{memberName}</strong> from the team? This cannot be undone.</p>
                      <div className="remove-confirm-actions">
                        <button className="remove-confirm-cancel" onClick={() => setConfirmingRemove(false)}>Keep member</button>
                        <button className="remove-confirm-ok" onClick={() => { removeEmployee(editingMember); closeMemberModal(); }}>Yes, remove</button>
                      </div>
                    </div>
                  ) : (
                    <div className="modal-actions">
                      <button className="btn-remove-shift" onClick={() => setConfirmingRemove(true)}>Remove from team</button>
                      <div className="modal-actions-right">
                        <Button onClick={closeMemberModal}>Cancel</Button>
                        <Button variant="primary" onClick={saveMemberEdit}>Save changes</Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {view === "history" && (
          <div className="page narrow-page">
            <section className="page-heading"><div><div className="title-row"><h1>Change history</h1></div><p>Review every schedule update and staffing decision.</p></div><Button icon="calendar">Sep 7 - Sep 20</Button></section>
            <section className="history-card">
              {[["Today, 10:42 AM", "Avery Morgan", "Moved Jordan Lee's Saturday start from 9 AM to 11 AM", "AI suggestion"], ["Today, 9:18 AM", "Avery Morgan", "Updated Friday demand forecast from 12 to 13", "Demand"], ["Yesterday, 4:06 PM", "System", "Imported 42 employee assignments from Master Schedule", "Import"], ["Sep 1, 11:30 AM", "Avery Morgan", "Created schedule for Sep 7 - Sep 20", "Created"]].map((item, i) => <div className="history-row" key={item[0] + i}><div className="history-line"><span /></div><div className="history-content"><div><strong>{item[2]}</strong><p>{item[1]} - {item[0]}</p></div><span className="history-tag">{item[3]}</span></div></div>)}
            </section>
          </div>
        )}
      </main>

      {editorOpen && (
        <div className="modal-backdrop" onMouseDown={() => setEditorOpen(false)}>
          <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Edit assignment</h2>
                <p>{schedule[editingEmployee].name}</p>
              </div>
              <Button variant="icon" icon="x" onClick={() => setEditorOpen(false)} />
            </div>

            <label>Dates
              <div className="day-select-header">
                <button
                  className="day-select-all"
                  onClick={() => setEditingDays(editingDays.length === days.length ? [editingDays[0]] : days.map((_, i) => i))}
                >
                  {editingDays.length === days.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="day-checkboxes">
                {days.map((day, i) => (
                  <label key={day.date} className={`day-chip ${editingDays.includes(i) ? "selected" : ""} ${day.weekend ? "weekend" : ""}`}>
                    <input
                      type="checkbox"
                      checked={editingDays.includes(i)}
                      onChange={() => setEditingDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort((a, b) => a - b))}
                    />
                    <span className="day-chip-label"><strong>{day.day.slice(0, 3)}</strong><small>{day.date.replace("Sep ", "")}</small></span>
                  </label>
                ))}
              </div>
            </label>

            <label>Shift time
              <div className="shift-time-inputs">
                <div className="shift-time-field">
                  <span>Start</span>
                  <input type="time" value={editingStartTime} onChange={(e) => setEditingStartTime(e.target.value)} />
                </div>
                <span className="shift-time-sep">→</span>
                <div className="shift-time-field">
                  <span>End</span>
                  <input type="time" value={editingEndTime} onChange={(e) => setEditingEndTime(e.target.value)} />
                </div>
              </div>
            </label>

            <div className="coverage-impact">
              <div>
                <span>Coverage impact at 11 AM</span>
                <strong>{editedPeakCoverage} / {requiredAtPeak[editingDayRef]} expected</strong>
                {schedule[editingEmployee].status !== "Productive" && <small>{schedule[editingEmployee].status} is excluded from productive staffing.</small>}
              </div>
              <span className={editedPeakCoverage >= requiredAtPeak[editingDayRef] ? "impact-good" : "impact-low"}>
                {nextEditContributes === currentEditContributes ? "No change" : nextEditContributes ? "+1" : "-1"}
              </span>
            </div>

            <div className="modal-actions">
              <button className="btn-remove-shift" onClick={removeShift}>Remove shift</button>
              <div className="modal-actions-right">
                <Button onClick={() => setEditorOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={saveShift}>Save assignment</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {assigningSlot && (
        <div className="assign-overlay" onClick={() => setAssigningSlot(null)}>
          <div className="assign-panel" onClick={(e) => e.stopPropagation()}>
            <div className="assign-panel-header">
              <div>
                <h3>Assign employee</h3>
                <p>{String(assigningSlot.hour).padStart(2, "0")}:00 shift</p>
              </div>
              <button className="assign-close" onClick={() => setAssigningSlot(null)}>&#x2715;</button>
            </div>
            <input
              className="assign-search-input"
              placeholder="Search by name..."
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              autoFocus
            />
            <ul className="assign-list">
              {schedule
                .filter((p) => Math.floor(timeValue(p.homeShift.split(" - ")[0])) !== assigningSlot.hour)
                .filter((p) => p.name.toLowerCase().includes(assignSearch.toLowerCase()))
                .map((p) => (
                  <li key={p.name}>
                    <button className="assign-list-item" onClick={() => confirmAssign(p.name, false)}>
                      <div className="assign-avatar">{p.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</div>
                      <div>
                        <strong>{p.name}</strong>
                        <span>{p.duty} · {compactShift(p.homeShift)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              {assignSearch.trim() && !schedule.some((p) => p.name.toLowerCase() === assignSearch.trim().toLowerCase()) && (
                <li className="assign-new-item">
                  <button className="assign-list-item assign-new-btn" onClick={() => confirmAssign(assignSearch.trim(), true)}>
                    <div className="assign-avatar assign-avatar-new"><Icon name="plus" size={14} /></div>
                    <div>
                      <strong>Add &ldquo;{assignSearch.trim()}&rdquo;</strong>
                      <span>Create new employee in this shift</span>
                    </div>
                  </button>
                </li>
              )}
              {schedule.filter((p) => Math.floor(timeValue(p.homeShift.split(" - ")[0])) !== assigningSlot.hour && p.name.toLowerCase().includes(assignSearch.toLowerCase())).length === 0 && !assignSearch.trim() && (
                <li className="assign-empty">No other employees to reassign. Type a name above to add someone new.</li>
              )}
            </ul>
          </div>
        </div>
      )}
      {toast && <div className="toast"><span>&#10003;</span>{toast}</div>}
    </div>
  );
}

export default App;
