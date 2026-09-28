-- Migration 0019: Admin Email Management
--
-- email_log      — per-email delivery record written by the email queue.
--                  Identical to the frontend's existing (never applied)
--                  migration 0015_add_email_log; IF NOT EXISTS makes either
--                  side safe to run.
-- email_settings — single-row (id = 1) admin-managed sender configuration.
--                  Credentials are NOT stored here; they stay in env vars.
-- Additive only: no existing table or row is modified.

CREATE TABLE IF NOT EXISTS email_log (
  id SERIAL PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  html_content TEXT,
  from_address TEXT,
  sent_at TIMESTAMP,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  dedup_key TEXT,
  metadata TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log (status, retry_count, created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_dedup ON email_log (event_type, recipient_email, created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_log (created_at DESC);

CREATE TABLE IF NOT EXISTS email_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sender_email TEXT,
  sender_name TEXT,
  sender_status TEXT NOT NULL DEFAULT 'unverified',
  sender_last_verified_at TIMESTAMP,
  last_verification_email TEXT,
  last_verification_error TEXT,
  last_verification_at TIMESTAMP,
  provider_status TEXT,
  provider_last_checked_at TIMESTAMP,
  provider_last_error TEXT,
  updated_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);