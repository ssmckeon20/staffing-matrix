export type MemberStatus = "Productive" | "Training" | "Vacation";
export type ShiftStatus = "Scheduled" | "Off" | "PTO" | "LOA" | "Vacation" | "Training" | "Premium Pay";

export type PremiumPayType = "base_plus" | "rate_plus_percent" | "other";
export type ViewType = "daily" | "weekly" | "bi-weekly" | "monthly" | "custom";
export type MatrixMode = "schedule" | "volume";

export interface AssignmentGroup {
  id: string;
  name: string;
  hours_of_service_start: string;
  hours_of_service_end: string;
  overtime_threshold: number;
  overtime_rate_multiplier: number;
  base_hourly_rate: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  group_id: string;
  name: string;
  employee_id?: string | null;
  status: MemberStatus;
  default_shift_start?: string;
  default_shift_end?: string;
  expected_weekly_hours: number;
  daily_unpaid_break: number;
  overtime_threshold: number;
  hourly_rate?: number;
  notes?: string | null;
  premium_pay_enabled?: boolean;
  premium_rate?: number;
  premium_start_date?: string | null;
  premium_end_date?: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ShiftAssignment {
  id: string;
  member_id: string;
  group_id: string;
  assignment_date: string;
  shift_start: string | null;
  shift_end: string | null;
  status: ShiftStatus;
  is_published: boolean;
  borrowed_from_group_id: string | null;
  premium_pay_type?: PremiumPayType | null;
  premium_pay_amount?: number | null;
  include_as_non_prod?: boolean;
  shift_override_break?: number | null;
  created_at: string;
  updated_at: string;
}

export interface VolumePlan {
  id: string;
  group_id: string;
  enabled: boolean;
  hours_of_service_start: string;
  hours_of_service_end: string;
  productivity_rate: number;
  weekend_multiplier: number;
  hourly_volume: number[];
  manual_staff: number[];
  created_at: string;
  updated_at: string;
}

export interface FteBudget {
  id: string;
  group_id: string;
  budgeted_fte: number;
}

export interface ScheduleNote {
  id: string;
  note_text: string;
}

export interface ScheduleHighlight {
  id: string;
  member_id: string;
  highlight_date: string;
}

export interface ChangeHistoryEntry {
  id: string;
  action_text: string;
  user_name: string;
  category: string;
  created_at: string;
}

export interface PublishedState {
  id: string;
  group_id: string;
  last_published_at: string | null;
  last_published_by: string;
}

export interface CompanyHoliday {
  id: string;
  holiday_date: string;
  name: string;
  created_at: string;
}

export interface VolumeDataPoint {
  id: string;
  group_id: string;
  event_date: string;
  day_of_week: number;
  hour: number;
  count: number;
  created_at: string;
}

export interface ScheduleTemplate {
  id: string;
  site_id: string | null;
  group_id: string;
  name: string;
  period_length_days: number;
  start_day_of_week: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleTemplateRow {
  id: string;
  site_id: string | null;
  template_id: string;
  member_id: string;
  day_of_week: number;
  day_offset: number;
  shift_start: string | null;
  shift_end: string | null;
  status: ShiftStatus;
  premium_pay_type: PremiumPayType | null;
  premium_pay_amount: number | null;
  include_as_non_prod: boolean;
  shift_override_break: number | null;
  borrowed_from_group_id: string | null;
  created_at: string;
}
