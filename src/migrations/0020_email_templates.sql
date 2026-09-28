-- Migration 0020: Admin-customized email templates (Admin → Email Management).
--
-- Stores ONLY reusable template text with {{placeholders}} — never recipient
-- data, credentials, tokens or rendered emails. A row overrides the built-in
-- code template for its event_type while is_active is true; deleting the row
-- (Reset to Default) restores the code template. Additive and idempotent.

CREATE TABLE IF NOT EXISTS email_templates (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- One customized template per event type.
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_event_type_unique_idx ON email_templates (event_type);