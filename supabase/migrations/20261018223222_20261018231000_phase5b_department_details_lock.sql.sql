/*
# Phase 5b: Department details lock

1. Plain-English summary
Adds a "details locked" flag to each department. The department Owner can set
the department name and cost center number once; after saving, the details are
locked and can no longer be changed from the app by anyone. This lets an
existing workspace (created before accounts existed) be labeled correctly one
time, then stay fixed.

2. Modified Tables
- `sites`
  - adds `details_locked boolean` (defaults to false). No existing data changed.
*/

ALTER TABLE sites ADD COLUMN IF NOT EXISTS details_locked boolean NOT NULL DEFAULT false;
