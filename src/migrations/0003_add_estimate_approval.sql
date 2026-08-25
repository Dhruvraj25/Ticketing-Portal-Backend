-- Migration: Add Estimate Approval Workflow Fields
-- Adds estimate tracking, approval, and additional hours fields to the ticket table.

ALTER TABLE ticket ADD COLUMN IF NOT EXISTS estimated_completion_date DATE;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS estimate_notes TEXT;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS estimate_submitted_at TIMESTAMP;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS estimate_approved_at TIMESTAMP;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS estimate_approved_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS auto_approved_at TIMESTAMP;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS approval_deadline TIMESTAMP;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS additional_hours_requested INTEGER;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS additional_hours_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS additional_hours_approved_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS additional_hours_auto_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ticket ADD COLUMN IF NOT EXISTS additional_hours_deadline TIMESTAMP;

-- Index for auto-approval queries
CREATE INDEX IF NOT EXISTS idx_ticket_approval_deadline ON ticket(approval_deadline) WHERE approval_deadline IS NOT NULL AND auto_approved = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_additional_hours_deadline ON ticket(additional_hours_deadline) WHERE additional_hours_deadline IS NOT NULL AND additional_hours_approved = FALSE;
