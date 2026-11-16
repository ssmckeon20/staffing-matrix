/*
# Add Employee ID and Notes to Team Members

1. Modified Tables
- `team_members`
  - `employee_id` (text, nullable): A free-form employee identifier entered by the user (e.g. HR or payroll number). Informational only — no app logic depends on it. Feeds future AI context about the staff roster.
  - `notes` (text, nullable): Plain-language availability considerations written by the user (e.g. "must have every Tuesday off", "only available after 2pm on Wednesdays"). Shown to schedulers in the Staffing Matrix when assigning that employee, and intended as context for the future AI assistant.

2. Existing Columns Reused
- `hourly_rate` already exists on `team_members` (numeric, default 0). It now becomes a user-editable input on the Team tab and is the basis for Labor Spend, overtime (1.5x over threshold), and Premium Pay calculations in the Staffing Matrix.

3. Security
- No changes. Row Level Security and existing policies on `team_members` are untouched; no new tables are created.

4. Important Notes
- Idempotent: uses IF NOT EXISTS guards, safe to re-run.
- Both new columns are nullable with no default so existing rows keep working unchanged.
*/

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS employee_id text;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS notes text;
